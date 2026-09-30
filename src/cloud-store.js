import {cloudClient,requireCloudUser} from './cloud-session.js';
import {privateCache} from './private-cache.js';
import {createProjectSync} from './project-sync.js';
import {readCloudDelta} from './cloud-delta.js';
import {LARGE_PROJECT_BYTES,projectSummary,mergeProjectSummary,projectBlobText} from './project-document.js';
import {createCOSStore} from './cos-store.js';
import {recoverImportOutbox} from './import-outbox-recovery.js';
export function createCloudStore({cloudClient,requireCloudUser,cache=null,namespace='cloud',projectPreview=()=>null,objectStorage=null}){
const BUCKET='shiye-private';
const writeProvider=()=>objectStorage?.enabled?'cos':'supabase';
const usableBlob=value=>value instanceof Blob&&value.size>0;
async function downloadObject(path,provider){if(provider==='cos'){if(!objectStorage)throw Error('COS 私有读取尚未配置');return objectStorage.download(path);}if(provider&&provider!=='supabase')throw Error('不支持的存储服务');return checked(await cloudClient().storage.from(BUCKET).download(path));}
async function uploadObject(path,blob,type,provider=writeProvider()){if(provider==='cos'){await objectStorage.upload(path,blob,type);return {error:null};}return cloudClient().storage.from(BUCKET).upload(path,blob,{upsert:false,contentType:type});}
let owner,revision,writesInFlight=0;
let queue=Promise.resolve();
const images=new Map();
const imageSizes=new Map();
const uploads=new Map();
const snapshots=new Map();
const documents=new Map();
function retainImage(path,data){images.set(path,Promise.resolve(data));imageSizes.delete(path);imageSizes.set(path,data.size);let bytes=[...imageSizes.values()].reduce((a,b)=>a+b,0);for(const [key,size] of imageSizes){if(bytes<=64*1024*1024&&imageSizes.size<=48)break;if(key===path)continue;images.delete(key);imageSizes.delete(key);bytes-=size;}}
let cacheDisabled=false;
const account=async()=>`${namespace}:${await identity()}`;
function reportSync(){if(typeof window!=='undefined'){const a=projectSync.status(),b=importSync.status();window.dispatchEvent(new CustomEvent('shiye-project-sync',{detail:{pending:a.pending+b.pending+writesInFlight,error:b.error||a.error}}));}}
const projectSync=createProjectSync({
  load:async()=>cache?await cache.get(await account(),'project-outbox'):[],
  write:async rows=>{if(!cache||cacheDisabled)throw Error('无法安全保存待同步作品');await cache.put(await account(),'project-outbox',rows);},
  commit:record=>cloudTransaction(['projects'],tx=>tx.objectStore('projects').put(record)),revision:()=>revision,
  onStatus:reportSync,
});
async function reconcileImport(batch){
  // Only an append-only import has unique IDs that prove an interrupted RPC
  // already committed atomically, or can be safely retried after an unrelated
  // revision. Never infer success or rebase for edits, deletes, or partial data.
  if(batch.operations)return 'conflict';
  const records=['assets','blobs','projects'].flatMap(store=>(batch[store]||[]).map(item=>({store,id:item.id})));
  if(!records.length||!(batch.assets?.length||batch.projects?.length))return 'conflict';
  let present=0;
  for(let offset=0;offset<records.length;offset+=5){
    const found=await Promise.all(records.slice(offset,offset+5).map(async({store,id})=>{
      const result=cloudClient().from('shiye_records').select('record').eq('user_id',await identity()).eq('store',store).eq('id',id).maybeSingle();
      return checked(await result)?.record?.id===id;
    }));
    present+=found.filter(Boolean).length;
  }
  return present===records.length?'committed':present===0?'rebase':'conflict';
}
// This durable, account-scoped outbox retains the complete batch, including
// original bytes. Only a successful cloud acknowledgement removes it.
const importSync=createProjectSync({
  load:async()=>{
    if(!cache)return [];
    const key=await account(),rows=await cache.get(key,'import-outbox')||[];
    const result=await recoverImportOutbox(rows,async(asset,ids)=>{
      const user=await identity();
      if(!ids.length)return false;
      const copies=checked(await cloudClient().from('shiye_records').select('id').eq('user_id',user).eq('store','blobs').in('id',ids).limit(1).abortSignal(AbortSignal.timeout(2500)));
      return copies.length>0;
    });
    if(!result.removed)return rows;
    // Do not show a local ghost after a confirmed cloud miss. This changes
    // only the broken, uncommitted outbox row; no cloud data is deleted.
    try{await cache.put(key,'import-outbox',result.rows);return result.rows;}
    catch{return rows;}
  },
  write:async rows=>{if(!cache||cacheDisabled)throw Error('无法安全暂存导入资料，请勿关闭页面');await cache.put(await account(),'import-outbox',rows);},
  commit:batch=>batch.operations?cloudTransaction(batch.names,tx=>{for(const op of batch.operations){const store=tx.objectStore(op.store);if(op.action==='put')store.put(op.item);else if(op.action==='delete')store.delete(op.id);else store.clear();}}):cloudTransaction(['assets','blobs','projects'],tx=>{for(const store of ['assets','blobs','projects'])for(const record of batch[store]||[])tx.objectStore(store).put(record);}),
  revision:()=>revision,reconcile:reconcileImport,onStatus:reportSync,
});
async function pendingOperations(store){await identity();return (await importSync.pending()).flatMap(row=>row.record.operations?.filter(op=>op.store===store)||(row.record[store]||[]).map(item=>({action:'put',store,item})));}
async function pendingOverride(store,id){let result;for(const op of await pendingOperations(store)){if(op.action==='clear'||op.action==='delete'&&op.id===id)result={found:true};else if(op.action==='put'&&op.item.id===id)result={found:true,record:op.item};}return result;}
async function overlayImports(store,records){const map=new Map(records.map(r=>[r.id,r]));for(const op of await pendingOperations(store)){if(op.action==='clear')map.clear();else if(op.action==='delete')map.delete(op.id);else map.set(op.item.id,op.item);}return [...map.values()];}
const cached=async key=>{try{const id=await account();return cacheDisabled?undefined:await cache?.get(id,key);}catch{return undefined;}};
const remember=async(key,value)=>{try{const id=await account();if(!cacheDisabled)await cache?.put(id,key,value);}catch{/* Cache quota/failure cannot fail a cloud operation. */}};
const checked=result=>{if(result.error)throw Error(result.error.message||'云端数据服务不可用');return result.data;};
async function identity(){return owner??=(await requireCloudUser()).id;}
async function version(){const id=await identity();const row=checked(await cloudClient().from('shiye_revisions').select('revision').eq('user_id',id).single());revision=Number(row.revision);return revision;}
async function cloudAll(store){
  await identity();if(revision===undefined)await version();
  const saved=snapshots.get(store)||await cached('records:'+store);
  if(saved?.revision===revision){snapshots.set(store,saved);return overlayImports(store,await Promise.all(saved.records.map(r=>decode(store,structuredClone(r)))));}
  const rows=[],readRevision=revision;
  for(let offset=0;;offset+=500){const page=checked(await cloudClient().from('shiye_records').select('record').eq('user_id',owner).eq('store',store).order('id').range(offset,offset+499));rows.push(...page);if(page.length<500)break;}
  const snapshot={revision:readRevision,records:rows.map(row=>row.record)};snapshots.set(store,snapshot);await remember('records:'+store,snapshot);
  return overlayImports(store,await Promise.all(snapshot.records.map(record=>decode(store,structuredClone(record)))));
}
async function cloudGet(store,id){
  const pending=await pendingOverride(store,id);
  if(pending&&!(store==='blobs'&&pending.record&&!usableBlob(pending.record.data)))return structuredClone(pending.record);
  // Safari can restore an outbox row without its Blob bytes after a forced
  // termination. A valid cloud copy takes precedence over that broken row.
  if(pending?.record){const remote=await cloudRecord(store,id);return remote?decode(store,remote):undefined;}
  if(store==='blobs'&&id.startsWith('project-cover:'))return {id,data:await cloudPreview(id)};
  const record=await cloudRecord(store,id);return record?store==='projects'?cloudProjectDocument(record):decode(store,record):undefined;
}
async function cloudProjectDocument(record){
  const path=record.projectDocumentPath;if(!path)return record;
  if(!path.startsWith((await identity())+'/'))throw Error('作品不属于当前账号');
  if(!documents.has(path)){
    const task=(async()=>{let blob=await cached('project-document:'+path);if(!(blob instanceof Blob)){blob=await downloadObject(path,record.projectDocumentProvider);await remember('project-document:'+path,blob);}const full=JSON.parse(await projectBlobText(blob,record.projectDocumentEncoding));if(full.id!==record.id||!Array.isArray(full.drafts))throw Error('作品完整数据损坏');return full;})().catch(error=>{documents.delete(path);throw error;});documents.set(path,task);if(documents.size>8)documents.delete(documents.keys().next().value);
  }
  return mergeProjectSummary(structuredClone(await documents.get(path)),record);
}
async function cloudRecord(store,id){
  await identity();if(revision===undefined)await version();
  if(store!=='blobs'){const saved=snapshots.get(store)||await cached('records:'+store);if(saved?.revision===revision){snapshots.set(store,saved);return structuredClone(saved.records.find(r=>r.id===id));}}
  if(store==='blobs'){const saved=await cached('blob-record:'+id);if(saved?.revision===revision)return saved.record;}
  const row=checked(await cloudClient().from('shiye_records').select('record').eq('user_id',owner).eq('store',store).eq('id',id).maybeSingle());
  if(row&&store==='blobs')await remember('blob-record:'+id,{revision,record:row.record});return row?.record;
}
async function cloudPreview(id){
  const pending=await pendingOverride('blobs',id);if(pending&&(!pending.record||usableBlob(pending.record.data)))return pending.record?await makeThumbnail(pending.record.data)||pending.record.data:undefined;
  if(id.startsWith('project-cover:')){const raw=id.slice('project-cover:'.length),provider=raw.startsWith('cos:')?'cos':undefined,path=provider?raw.slice(4):raw;if(!path.startsWith((await identity())+'/'))throw Error('作品封面不属于当前账号');const key='thumbnail:'+path,saved=await cached(key);if(usableBlob(saved))return saved;const blob=await downloadObject(path,provider);if(!usableBlob(blob))throw Error('作品封面为空');await remember(key,blob);return blob;}
  await identity();const old=revision===undefined?await cached('blob-record:'+id):null;
  const record=old?.record||await cloudRecord('blobs',id);if(!record)return undefined;
  if(!record.storagePath?.startsWith(owner+'/'))throw Error('图片不属于当前账号');
  const thumbnailKey='thumbnail:'+record.storagePath,saved=await cached(thumbnailKey);if(usableBlob(saved))return saved;
  if(record.thumbnailPath){
    if(!record.thumbnailPath.startsWith(owner+'/'))throw Error('缩略图不属于当前账号');
    try{const thumbnail=await downloadObject(record.thumbnailPath,record.storageProvider);if(!usableBlob(thumbnail))throw Error('缩略图为空');await remember(thumbnailKey,thumbnail);return thumbnail;}
    catch(error){console.warn('缩略图暂不可读，尝试从原图恢复',error?.message);}
  }
  const {data}=await decode('blobs',record);
  const blob=await makeThumbnail(data);if(blob){await remember(thumbnailKey,blob);return blob;}return data;
}
async function makeThumbnail(data){if(typeof createImageBitmap!=='function'||typeof document==='undefined')return null;const bitmap=await createImageBitmap(data);try{const scale=Math.min(1,360/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));}finally{bitmap.close();}}
async function decode(store,record){
  if(store!=='blobs')return record;
  const {storagePath,...metadata}=record;
  if(!storagePath?.startsWith((await identity())+'/'))throw Error('图片不属于当前账号');
  if(!images.has(storagePath)){const pending=(async()=>{const saved=await cached('image:'+storagePath);if(usableBlob(saved))return saved;const data=await downloadObject(storagePath,record.storageProvider);if(!usableBlob(data))throw Error('云端图片为空');await remember('image:'+storagePath,data);return data;})().catch(error=>{images.delete(storagePath);throw error;});images.set(storagePath,pending);}
  const data=await images.get(storagePath);imageSizes.delete(storagePath);imageSizes.set(storagePath,data.size);let bytes=[...imageSizes.values()].reduce((a,b)=>a+b,0);for(const [path,size] of imageSizes){if(bytes<=64*1024*1024&&imageSizes.size<=48)break;if(path===storagePath)continue;images.delete(path);imageSizes.delete(path);bytes-=size;}return {...metadata,data};
}
async function encode(store,record){
  if(store==='projects'){
    if(record.projectDocumentPath)record=await cloudProjectDocument(record);
    const text=JSON.stringify(record);let blob=new Blob([text],{type:'application/json'}),encoding;
    if(blob.size<=LARGE_PROJECT_BYTES)return record;
    if(typeof CompressionStream==='function'&&typeof DecompressionStream==='function'){blob=await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();encoding='gzip';}
    const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()),hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join(''),path=`${await identity()}/${hash}-project.json${encoding?'.gz':''}`;
    const provider=writeProvider(),uploaded=await uploadObject(path,blob,encoding?'application/gzip':'application/json',provider);if(uploaded.error&&String(uploaded.error.statusCode)!=='409')throw Error('作品完整数据上传失败，未修改云端元数据');
    const summary={...projectSummary(record,path,encoding),projectDocumentProvider:provider};
    try{const preview=await projectPreview(record);if(preview instanceof Blob){const cover=path+'-preview.webp',result=await uploadObject(cover,preview,preview.type||'image/webp',provider);if(!result.error||String(result.error.statusCode)==='409'){const d=summary.drafts.find(d=>d.id===record.activeDraftID)||summary.drafts[0];d.coverImageID='project-cover:'+(provider==='cos'?'cos:':'')+cover;await remember('thumbnail:'+cover,preview);}}}catch{/* A missing optional preview cannot discard the editable work. */}
    await remember('project-document:'+path,blob);documents.set(path,Promise.resolve(structuredClone(record)));if(documents.size>8)documents.delete(documents.keys().next().value);return summary;
  }
  if(store!=='blobs')return record;
  if(!usableBlob(record.data))throw Error('图片字节丢失或为空；云端元数据未修改');
  const bytes=await record.data.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
  const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const storagePath=`${await identity()}/${hash}`,provider=writeProvider();
  if(!uploads.has(storagePath)){const task=(async()=>{const uploaded=await uploadObject(storagePath,record.data,record.data.type||'application/octet-stream',provider);if(uploaded.error&&uploaded.error.statusCode!=='409'&&uploaded.error.statusCode!==409)throw Error('图片上传失败，未保存元数据');})().catch(error=>{uploads.delete(storagePath);throw error;});uploads.set(storagePath,task);}await uploads.get(storagePath);
  // New records get a private, immutable thumbnail, so first-screen loading
  // does not need the original. Legacy records generate and cache it on demand.
  let thumbnailPath;
  try{const thumbnail=await makeThumbnail(record.data);if(thumbnail){const path=storagePath+'-preview360.webp';const result=await uploadObject(path,thumbnail,'image/webp',provider);if(!result.error||String(result.error.statusCode)==='409'){thumbnailPath=path;await remember('thumbnail:'+storagePath,thumbnail);}}}catch{/* Optional thumbnail failure must not lose an otherwise valid original. */}
  await remember('image:'+storagePath,record.data);retainImage(storagePath,record.data);
  const {data,thumbnailPath:_oldThumbnail,...metadata}=record;return {...metadata,storagePath,storageProvider:provider,...(thumbnailPath?{thumbnailPath}:{})};
}
function cloudTransaction(names,fn){
  const operations=[];const result=fn({objectStore(store){if(!names.includes(store))throw Error('此表未加入事务');return {put:record=>operations.push({action:'put',store,item:structuredClone(record)}),delete:id=>operations.push({action:'delete',store,id}),clear:()=>operations.push({action:'clear',store})};}});
  if(result?.then)throw Error('事务回调必须同步');
  const run=async()=>{
    writesInFlight++;reportSync();
    try{
    await identity();if(revision===undefined)await version();
    const previous=revision;
    const puts=operations.filter(op=>op.action==='put');for(let offset=0;offset<puts.length;offset+=3)await Promise.all(puts.slice(offset,offset+3).map(async op=>{op.item=await encode(op.store,op.item);}));
    const data=checked(await cloudClient().rpc('shiye_commit',{operations,expected_revision:previous}));revision=Number(data);
    for(const op of operations)if(op.store==='blobs'&&op.action==='put')await remember('blob-record:'+op.item.id,{revision,record:op.item});
    // Patch only cached collections belonging to the committed base revision.
    // Remote conflicts never write to this cache or silently become local edits.
    for(const store of ['assets','series','projects','trash','meta','blobs']){
      const saved=snapshots.get(store)||await cached('records:'+store);if(saved?.revision!==previous)continue;
      const records=new Map(saved.records.map(r=>[r.id,r]));for(const op of operations.filter(o=>o.store===store)){if(op.action==='clear')records.clear();else if(op.action==='delete')records.delete(op.id);else records.set(op.item.id,op.item);}
      const next={revision,records:[...records.values()]};snapshots.set(store,next);await remember('records:'+store,next);
    }
    await projectSync.advance(previous,revision);
    await importSync.advance(previous,revision);
    }finally{writesInFlight--;reportSync();}
  };
  const pending=queue.then(run);queue=pending.catch(()=>{});return pending;
}
async function cloudCheckpoint(){
  await cloudFlushProjects();
  await identity();const current=Number(checked(await cloudClient().from('shiye_revisions').select('revision').eq('user_id',owner).single()).revision);
  if(revision!==undefined&&revision!==current)throw Error('另一设备已更新资料，请刷新后重试；未导出不一致的备份');
  return current;
}
async function cloudCachedCollections(){await identity();const result={},savedRows=[];for(const store of ['assets','series','projects','trash']){const saved=await cached('records:'+store);if(!saved||savedRows.length&&saved.revision!==savedRows[0].revision)return null;savedRows.push(saved);result[store]=await overlayImports(store,structuredClone(saved.records));}revision=savedRows[0].revision;return result;}
async function cloudRefresh(){
  await queue;
  const before=revision,current=await version(),changed=before!==undefined&&before!==current;
  if(!changed)return {revision:current,changed:false};
  for(const store of ['assets','series','projects','trash','meta','blobs'])if(!snapshots.has(store)){const saved=await cached('records:'+store);if(saved)snapshots.set(store,saved);}
  const delta=await readCloudDelta({client:cloudClient(),owner,before,after:current,snapshots});
  if(delta){for(const [store,snapshot] of delta.snapshots){snapshots.set(store,snapshot);await remember('records:'+store,snapshot);}return {revision:current,changed:true,incremental:true,blobIDs:delta.blobIDs,allBlobs:delta.allBlobs};}
  return {revision:current,changed:true,incremental:false,allBlobs:true};
}
async function cloudStageProject(record){await identity();if(revision===undefined)await version();return projectSync.stage(record);}
async function cloudStageImport(batch){await identity();if(revision===undefined)await version();await importSync.stage({...batch,id:crypto.randomUUID()});return {pending:true};}
async function cloudStageMutation(names,fn){
  const operations=[],result=fn({objectStore(store){if(!names.includes(store))throw Error('此表未加入事务');return {put:item=>operations.push({action:'put',store,item:structuredClone(item)}),delete:id=>operations.push({action:'delete',store,id}),clear:()=>operations.push({action:'clear',store})};}});
  if(result?.then)throw Error('事务回调必须同步');if(!operations.length)return;
  await identity();if(revision===undefined)await version();await importSync.stage({id:crypto.randomUUID(),names,operations});
}
async function cloudPendingProjects(){await identity();return projectSync.pending();}
async function cloudFlushProjects(){await identity();if(revision===undefined)await version();await importSync.flush();return projectSync.flush();}
async function cloudClearCache(){cacheDisabled=true;const id=await account();images.clear();imageSizes.clear();documents.clear();snapshots.clear();await cache?.clear(id);}
return {cloudAll,cloudGet,cloudPreview,cloudTransaction,cloudStageMutation,cloudCheckpoint,cloudCachedCollections,cloudRefresh,cloudClearCache,cloudStageProject,cloudStageImport,cloudPendingProjects,cloudFlushProjects,cloudProjectDocument};
}
let projectPreview=()=>null;
export const setCloudProjectPreview=producer=>{projectPreview=producer;};
const current=createCloudStore({cloudClient,requireCloudUser,cache:privateCache,namespace:import.meta.env?.VITE_SHIYE_SUPABASE_URL||'cloud',projectPreview:record=>projectPreview(record),objectStorage:createCOSStore({client:cloudClient,enabled:import.meta.env?.VITE_SHIYE_OBJECT_STORAGE==='cos'})});
export const cloudAll=(...args)=>current.cloudAll(...args);
export const cloudGet=(...args)=>current.cloudGet(...args);
export const cloudTransaction=(...args)=>current.cloudTransaction(...args);
export const cloudCheckpoint=(...args)=>current.cloudCheckpoint(...args);
export const cloudCachedCollections=(...args)=>current.cloudCachedCollections(...args);
export const cloudRefresh=(...args)=>current.cloudRefresh(...args);
export const cloudClearCache=(...args)=>current.cloudClearCache(...args);
export const cloudPreview=(...args)=>current.cloudPreview(...args);
export const cloudStageProject=(...args)=>current.cloudStageProject(...args);
export const cloudStageImport=(...args)=>current.cloudStageImport(...args);
export const cloudStageMutation=(...args)=>current.cloudStageMutation(...args);
export const cloudPendingProjects=(...args)=>current.cloudPendingProjects(...args);
export const cloudFlushProjects=(...args)=>current.cloudFlushProjects(...args);
export const cloudProjectDocument=(...args)=>current.cloudProjectDocument(...args);

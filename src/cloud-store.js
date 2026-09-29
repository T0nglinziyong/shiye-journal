import {cloudClient,requireCloudUser} from './cloud-session.js';
import {privateCache} from './private-cache.js';
import {createProjectSync} from './project-sync.js';
import {readCloudDelta} from './cloud-delta.js';
import {LARGE_PROJECT_BYTES,projectSummary,mergeProjectSummary,projectBlobText} from './project-document.js';
export function createCloudStore({cloudClient,requireCloudUser,cache=null,namespace='cloud',projectPreview=()=>null}){
const BUCKET='shiye-private';
let owner,revision;
let queue=Promise.resolve();
const images=new Map();
const imageSizes=new Map();
const uploads=new Map();
const snapshots=new Map();
const documents=new Map();
function retainImage(path,data){images.set(path,Promise.resolve(data));imageSizes.delete(path);imageSizes.set(path,data.size);let bytes=[...imageSizes.values()].reduce((a,b)=>a+b,0);for(const [key,size] of imageSizes){if(bytes<=64*1024*1024&&imageSizes.size<=48)break;if(key===path)continue;images.delete(key);imageSizes.delete(key);bytes-=size;}}
let cacheDisabled=false;
const account=async()=>`${namespace}:${await identity()}`;
const projectSync=createProjectSync({
  load:async()=>cache?await cache.get(await account(),'project-outbox'):[],
  write:async rows=>{if(!cache||cacheDisabled)throw Error('无法安全保存待同步作品');await cache.put(await account(),'project-outbox',rows);},
  commit:record=>cloudTransaction(['projects'],tx=>tx.objectStore('projects').put(record)),revision:()=>revision,
  onStatus:status=>{if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('shiye-project-sync',{detail:status}));},
});
const cached=async key=>{try{const id=await account();return cacheDisabled?undefined:await cache?.get(id,key);}catch{return undefined;}};
const remember=async(key,value)=>{try{const id=await account();if(!cacheDisabled)await cache?.put(id,key,value);}catch{/* Cache quota/failure cannot fail a cloud operation. */}};
const checked=result=>{if(result.error)throw Error(result.error.message||'云端数据服务不可用');return result.data;};
async function identity(){return owner??=(await requireCloudUser()).id;}
async function version(){const id=await identity();const row=checked(await cloudClient().from('shiye_revisions').select('revision').eq('user_id',id).single());revision=Number(row.revision);return revision;}
async function cloudAll(store){
  await identity();if(revision===undefined)await version();
  const saved=snapshots.get(store)||await cached('records:'+store);
  if(saved?.revision===revision){snapshots.set(store,saved);return Promise.all(saved.records.map(r=>decode(store,structuredClone(r))));}
  const rows=[],readRevision=revision;
  for(let offset=0;;offset+=500){const page=checked(await cloudClient().from('shiye_records').select('record').eq('user_id',owner).eq('store',store).order('id').range(offset,offset+499));rows.push(...page);if(page.length<500)break;}
  const snapshot={revision:readRevision,records:rows.map(row=>row.record)};snapshots.set(store,snapshot);await remember('records:'+store,snapshot);
  return Promise.all(snapshot.records.map(record=>decode(store,structuredClone(record))));
}
async function cloudGet(store,id){
  if(store==='blobs'&&id.startsWith('project-cover:'))return {id,data:await cloudPreview(id)};
  const record=await cloudRecord(store,id);return record?store==='projects'?cloudProjectDocument(record):decode(store,record):undefined;
}
async function cloudProjectDocument(record){
  const path=record.projectDocumentPath;if(!path)return record;
  if(!path.startsWith((await identity())+'/'))throw Error('作品不属于当前账号');
  if(!documents.has(path)){
    const task=(async()=>{let blob=await cached('project-document:'+path);if(!(blob instanceof Blob)){blob=checked(await cloudClient().storage.from(BUCKET).download(path));await remember('project-document:'+path,blob);}const full=JSON.parse(await projectBlobText(blob,record.projectDocumentEncoding));if(full.id!==record.id||!Array.isArray(full.drafts))throw Error('作品完整数据损坏');return full;})().catch(error=>{documents.delete(path);throw error;});documents.set(path,task);if(documents.size>8)documents.delete(documents.keys().next().value);
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
  if(id.startsWith('project-cover:')){const path=id.slice('project-cover:'.length);if(!path.startsWith((await identity())+'/'))throw Error('作品封面不属于当前账号');const key='thumbnail:'+path,saved=await cached(key);if(saved instanceof Blob)return saved;const blob=checked(await cloudClient().storage.from(BUCKET).download(path));await remember(key,blob);return blob;}
  await identity();const old=revision===undefined?await cached('blob-record:'+id):null;
  const record=old?.record||await cloudRecord('blobs',id);if(!record)return undefined;
  if(!record.storagePath?.startsWith(owner+'/'))throw Error('图片不属于当前账号');
  const thumbnailKey='thumbnail:'+record.storagePath,saved=await cached(thumbnailKey);if(saved instanceof Blob)return saved;
  if(record.thumbnailPath){
    if(!record.thumbnailPath.startsWith(owner+'/'))throw Error('缩略图不属于当前账号');
    const thumbnail=checked(await cloudClient().storage.from(BUCKET).download(record.thumbnailPath));await remember(thumbnailKey,thumbnail);return thumbnail;
  }
  const {data}=await decode('blobs',record);
  const blob=await makeThumbnail(data);if(blob){await remember(thumbnailKey,blob);return blob;}return data;
}
async function makeThumbnail(data){if(typeof createImageBitmap!=='function'||typeof document==='undefined')return null;const bitmap=await createImageBitmap(data);try{const scale=Math.min(1,360/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));}finally{bitmap.close();}}
async function decode(store,record){
  if(store!=='blobs')return record;
  const {storagePath,...metadata}=record;
  if(!storagePath?.startsWith((await identity())+'/'))throw Error('图片不属于当前账号');
  if(!images.has(storagePath)){const pending=(async()=>{const saved=await cached('image:'+storagePath);if(saved instanceof Blob)return saved;const data=checked(await cloudClient().storage.from(BUCKET).download(storagePath));await remember('image:'+storagePath,data);return data;})().catch(error=>{images.delete(storagePath);throw error;});images.set(storagePath,pending);}
  const data=await images.get(storagePath);imageSizes.delete(storagePath);imageSizes.set(storagePath,data.size);let bytes=[...imageSizes.values()].reduce((a,b)=>a+b,0);for(const [path,size] of imageSizes){if(bytes<=64*1024*1024&&imageSizes.size<=48)break;if(path===storagePath)continue;images.delete(path);imageSizes.delete(path);bytes-=size;}return {...metadata,data};
}
async function encode(store,record){
  if(store==='projects'){
    if(record.projectDocumentPath)record=await cloudProjectDocument(record);
    const text=JSON.stringify(record);let blob=new Blob([text],{type:'application/json'}),encoding;
    if(blob.size<=LARGE_PROJECT_BYTES)return record;
    if(typeof CompressionStream==='function'&&typeof DecompressionStream==='function'){blob=await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();encoding='gzip';}
    const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()),hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join(''),path=`${await identity()}/${hash}-project.json${encoding?'.gz':''}`;
    const uploaded=await cloudClient().storage.from(BUCKET).upload(path,blob,{upsert:false,contentType:encoding?'application/gzip':'application/json'});if(uploaded.error&&String(uploaded.error.statusCode)!=='409')throw Error('作品完整数据上传失败，未修改云端元数据');
    const summary=projectSummary(record,path,encoding);
    try{const preview=await projectPreview(record);if(preview instanceof Blob){const cover=path+'-preview.webp',result=await cloudClient().storage.from(BUCKET).upload(cover,preview,{upsert:false,contentType:preview.type||'image/webp'});if(!result.error||String(result.error.statusCode)==='409'){const d=summary.drafts.find(d=>d.id===record.activeDraftID)||summary.drafts[0];d.coverImageID='project-cover:'+cover;await remember('thumbnail:'+cover,preview);}}}catch{/* A missing optional preview cannot discard the editable work. */}
    await remember('project-document:'+path,blob);documents.set(path,Promise.resolve(structuredClone(record)));if(documents.size>8)documents.delete(documents.keys().next().value);return summary;
  }
  if(store!=='blobs')return record;
  if(!(record.data instanceof Blob))throw Error('图片必须是完整 Blob');
  const bytes=await record.data.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
  const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const storagePath=`${await identity()}/${hash}`;
  if(!uploads.has(storagePath)){const task=(async()=>{const uploaded=await cloudClient().storage.from(BUCKET).upload(storagePath,record.data,{upsert:false,contentType:record.data.type||'application/octet-stream'});if(uploaded.error&&uploaded.error.statusCode!=='409'&&uploaded.error.statusCode!==409)throw Error('图片上传失败，未保存元数据');})().catch(error=>{uploads.delete(storagePath);throw error;});uploads.set(storagePath,task);}await uploads.get(storagePath);
  // New records get a private, immutable thumbnail, so first-screen loading
  // does not need the original. Legacy records generate and cache it on demand.
  let thumbnailPath;
  try{const thumbnail=await makeThumbnail(record.data);if(thumbnail){const path=storagePath+'-preview360.webp';const result=await cloudClient().storage.from(BUCKET).upload(path,thumbnail,{upsert:false,contentType:'image/webp'});if(!result.error||String(result.error.statusCode)==='409'){thumbnailPath=path;await remember('thumbnail:'+storagePath,thumbnail);}}}catch{/* Optional thumbnail failure must not lose an otherwise valid original. */}
  await remember('image:'+storagePath,record.data);retainImage(storagePath,record.data);
  const {data,thumbnailPath:_oldThumbnail,...metadata}=record;return {...metadata,storagePath,...(thumbnailPath?{thumbnailPath}:{})};
}
function cloudTransaction(names,fn){
  const operations=[];const result=fn({objectStore(store){if(!names.includes(store))throw Error('此表未加入事务');return {put:record=>operations.push({action:'put',store,item:structuredClone(record)}),delete:id=>operations.push({action:'delete',store,id}),clear:()=>operations.push({action:'clear',store})};}});
  if(result?.then)throw Error('事务回调必须同步');
  const run=async()=>{
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
  };
  const pending=queue.then(run);queue=pending.catch(()=>{});return pending;
}
async function cloudCheckpoint(){
  await cloudFlushProjects();
  await identity();const current=Number(checked(await cloudClient().from('shiye_revisions').select('revision').eq('user_id',owner).single()).revision);
  if(revision!==undefined&&revision!==current)throw Error('另一设备已更新资料，请刷新后重试；未导出不一致的备份');
  return current;
}
async function cloudCachedCollections(){await identity();const result={},savedRows=[];for(const store of ['assets','series','projects','trash']){const saved=await cached('records:'+store);if(!saved||savedRows.length&&saved.revision!==savedRows[0].revision)return null;savedRows.push(saved);result[store]=structuredClone(saved.records);}revision=savedRows[0].revision;return result;}
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
async function cloudPendingProjects(){await identity();return projectSync.pending();}
async function cloudFlushProjects(){await identity();if(revision===undefined)await version();return projectSync.flush();}
async function cloudClearCache(){cacheDisabled=true;const id=await account();images.clear();imageSizes.clear();documents.clear();snapshots.clear();await cache?.clear(id);}
return {cloudAll,cloudGet,cloudPreview,cloudTransaction,cloudCheckpoint,cloudCachedCollections,cloudRefresh,cloudClearCache,cloudStageProject,cloudPendingProjects,cloudFlushProjects,cloudProjectDocument};
}
let projectPreview=()=>null;
export const setCloudProjectPreview=producer=>{projectPreview=producer;};
const current=createCloudStore({cloudClient,requireCloudUser,cache:privateCache,namespace:import.meta.env?.VITE_SHIYE_SUPABASE_URL||'cloud',projectPreview:record=>projectPreview(record)});
export const cloudAll=(...args)=>current.cloudAll(...args);
export const cloudGet=(...args)=>current.cloudGet(...args);
export const cloudTransaction=(...args)=>current.cloudTransaction(...args);
export const cloudCheckpoint=(...args)=>current.cloudCheckpoint(...args);
export const cloudCachedCollections=(...args)=>current.cloudCachedCollections(...args);
export const cloudRefresh=(...args)=>current.cloudRefresh(...args);
export const cloudClearCache=(...args)=>current.cloudClearCache(...args);
export const cloudPreview=(...args)=>current.cloudPreview(...args);
export const cloudStageProject=(...args)=>current.cloudStageProject(...args);
export const cloudPendingProjects=(...args)=>current.cloudPendingProjects(...args);
export const cloudFlushProjects=(...args)=>current.cloudFlushProjects(...args);
export const cloudProjectDocument=(...args)=>current.cloudProjectDocument(...args);

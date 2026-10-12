import {openDB,unwrap} from 'idb';
import {createStorageRouter} from './storage-router.js';
import {cloudEnabled} from './cloud-session.js';
import {prepareProjectScene,prepareProjectList,attachSceneV2} from './scene-v2.js';
import {cloudAll,cloudGet,cloudTransaction,cloudStageMutation,cloudCheckpoint,cloudCachedCollections,cloudRefresh,cloudPreview,cloudStageProject,cloudStageImport,cloudPendingProjects,cloudPendingDetails,cloudDiscardPending,cloudFlushProjects,cloudProjectDocument,cloudEmergencySnapshot,cloudRestoreEmergency,cloudBackupBlobIDs} from './cloud-store.js';
import {createPendingRecovery,parsePendingRecovery} from './emergency-backup.js';
import {validateBackupData,validateRestoredRecords} from './backup-integrity.js';
// Exceptional destructive imports require an acknowledged atomic cloud commit.
export async function confirmedTransaction(names,fn){if(cloudEnabled){await cloudFlushProjects();return cloudTransaction(names,fn);}return transaction(names,fn);}
export async function stageImport(batch){if(cloudEnabled)return cloudStageImport(batch);await transaction(['assets','blobs','projects'],tx=>{for(const store of ['assets','blobs','projects'])for(const record of batch[store]||[])tx.objectStore(store).put(record);});return {pending:false};}
export const stageProject=record=>{prepareProjectScene(record);return cloudEnabled?cloudStageProject(record):put('projects',record);};
export const pendingProjects=()=>cloudEnabled?cloudPendingProjects():Promise.resolve([]);
export const pendingSyncDetails=()=>cloudEnabled?cloudPendingDetails():Promise.resolve({projects:[],batches:[],error:null});
export async function createEmergencyBackup(){
  if(!cloudEnabled)throw Error('应急待同步备份仅适用于云端账号');
  return createPendingRecovery(await cloudEmergencySnapshot());
}
export async function restoreEmergencyBackup(file){
  if(!cloudEnabled)throw Error('应急恢复仅适用于云端账号');
  const parsed=await parsePendingRecovery(file);
  return cloudRestoreEmergency(parsed);
}
export const discardPendingSync=()=>cloudEnabled?cloudDiscardPending():Promise.resolve(0);
export const flushProjects=()=>cloudEnabled?cloudFlushProjects():Promise.resolve();
export const completeProject=record=>cloudEnabled?cloudProjectDocument(record):Promise.resolve(record);
export const cachedCollections=()=>cloudEnabled?cloudCachedCollections():Promise.resolve(null);
export const refreshCloud=()=>cloudEnabled?cloudRefresh():Promise.resolve(null);
export const previewBlob=(id,pixels=720)=>cloudEnabled?cloudPreview(id,pixels):get('blobs',id).then(r=>r?.data);
const DB='shiye-pwa-full-v1';
const STORES=['assets','blobs','series','projects','meta','trash'];
let connection;
const CONFIG_KEY='shiye-data-server-v1';
let backend;
let sameOriginServer=false;
export function storageConfig(){try{return JSON.parse(localStorage.getItem(CONFIG_KEY)||'null');}catch{return null;}}
export function setStorageConfig(config){if(config)localStorage.setItem(CONFIG_KEY,JSON.stringify(config));else localStorage.removeItem(CONFIG_KEY);backend=undefined;sameOriginServer=false;}
export function isSameOriginServer(){return sameOriginServer;}
export async function storageMode(){return storageRouter.mode();}
async function resolveBackend(){
  if(cloudEnabled)return {cloud:true};
  if(backend)return backend;
  const config=storageConfig();
  if(config?.url){const url=new URL(config.url);if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('远程数据地址必须使用 HTTPS');if(document.querySelector('meta[name="shiye-server"]')&&url.origin!==location.origin)throw Error('自托管站点只允许使用同域名数据服务，请清除旧服务器配置');const candidate={url:url.origin,token:config.token||''},health=await serverRequest('/api/health',{backend:candidate});if(health.server!=='shiye-local')throw Error('该地址不是拾页数据服务');sameOriginServer=url.origin===location.origin;await serverRequest('/api/store/meta',{backend:candidate});return backend=candidate;}
  let r;try{r=await fetch('/api/health',{cache:'no-store'});}catch(error){if(document.querySelector('meta[name="shiye-server"]'))throw Error('拾页服务器暂时不可用，请检查 4090 电脑及网络；未切换到浏览器存储');return backend={};}
  if(r.ok){let health;try{health=await r.json();}catch{}if(health?.server==='shiye-local'){sameOriginServer=true;const candidate={url:location.origin,token:''};await serverRequest('/api/store/meta',{backend:candidate});return backend=candidate;}}
  if(document.querySelector('meta[name="shiye-server"]'))throw Error('拾页数据服务响应异常；未切换到浏览器存储');
  return backend={};
}
async function serverRequest(path,{backend:target,method='GET',data}={}){const b=target||await resolveBackend(),r=await fetch(b.url+path,{method,headers:{...(b.token?{Authorization:`Bearer ${b.token}`}:{ }),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store'});let result;try{result=await r.json();}catch{throw Error('数据服务没有返回有效 JSON');}if(!r.ok){const error=Error(result.error||`数据服务 HTTP ${r.status}`);error.status=r.status;throw error;}return result;}
async function localDatabase(){
  if(connection)return connection;
  connection=openDB(DB,1,{upgrade(db){for(const name of STORES)if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});}}).catch(e=>{connection=undefined;throw e;});return connection;
}
async function localAll(name){return (await localDatabase()).getAll(name);}
async function serverAll(name){return Promise.all((await serverRequest(`/api/store/${name}`)).map(decodeItem.bind(null,name)));}
async function serverGet(name,id){try{return await decodeItem(name,await serverRequest(`/api/store/${name}/${encodeURIComponent(id)}`));}catch(e){if(e.message==='不存在')return undefined;throw e;}}
async function serverTransaction(names,fn){
  const operations=[],tx={objectStore(name){if(!names.includes(name))throw Error('此表未加入事务');return {put:item=>operations.push({action:'put',store:name,item}),delete:id=>operations.push({action:'delete',store:name,id}),clear:()=>operations.push({action:'clear',store:name})};}};
  const result=fn(tx);if(result?.then)throw Error('事务回调必须同步，网络及图像处理请在事务外完成');
  for(const op of operations)if(op.store==='blobs'&&op.action==='put')op.item={...op.item,data:await toBase64(op.item.data)};
  await serverRequest('/api/transaction',{method:'POST',data:{operations}});
}
async function browserTransaction(names,fn){
  const tx=(await localDatabase()).transaction(names,'readwrite');
  try{const result=fn(unwrap(tx));if(result?.then)throw Error('事务回调必须同步，网络及图像处理请在事务外完成');}
  catch(e){tx.abort();await tx.done.catch(()=>{});throw e;}
  await tx.done;
}
const storageRouter=createStorageRouter(
  async()=>cloudEnabled?'cloud':(await resolveBackend()).url?'server':'browser',
  {
    cloud:{all:cloudAll,get:cloudGet,transaction:cloudStageMutation},
    server:{all:serverAll,get:serverGet,transaction:serverTransaction},
    browser:{all:localAll,get:(name,id)=>localDatabase().then(db=>db.get(name,id)),transaction:browserTransaction}
  }
);
export async function all(name){const rows=await storageRouter.all(name);return name==='projects'?prepareProjectList(rows):rows;}
export async function get(name,id){const record=await storageRouter.get(name,id);return name==='projects'&&record?prepareProjectScene(record):record;}
export async function put(name,item){if(name==='projects')prepareProjectScene(item);return transaction([name],tx=>tx.objectStore(name).put(item));}
export async function remove(name,id){return transaction([name],tx=>tx.objectStore(name).delete(id));}
export const transaction=(names,fn)=>storageRouter.transaction(names,fn);
const toBase64=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
function fromBase64(value){const [prefix,body]=value.split(',');const type=/data:([^;]+)/.exec(prefix)?.[1]||'application/octet-stream';const b=atob(body);const arr=new Uint8Array(b.length);for(let i=0;i<b.length;i++)arr[i]=b.charCodeAt(i);return new Blob([arr],{type});}
async function decodeItem(name,item){return name==='blobs'?{...item,data:fromBase64(item.data)}:item;}
async function backupBlobIDs({browserOnly=false}={}){
  if(cloudEnabled&&!browserOnly)return cloudBackupBlobIDs();
  if(browserOnly||!cloudEnabled&&!(await resolveBackend()).url)return (await localDatabase()).getAllKeys('blobs');
  // Self-host server support still uses the existing route. This is not the
  // active production data path; server pagination is a separate improvement.
  return (await serverAll('blobs')).map(row=>row.id);
}
export async function createBackup({browserOnly=false,onChunk,onProgress=()=>{}}={}){
  const snapshot=cloudEnabled&&!browserOnly?await cloudCheckpoint():null;
  const records={};
  if(browserOnly||!cloudEnabled&&!(await resolveBackend()).url){
    const tx=(await localDatabase()).transaction(STORES.filter(name=>name!=='blobs'));
    const names=STORES.filter(name=>name!=='blobs');
    const values=await Promise.all(names.map(name=>tx.objectStore(name).getAll()));await tx.done;
    names.forEach((name,i)=>{records[name]=values[i];});
  }else{
    for(const name of STORES.filter(name=>name!=='blobs'))records[name]=await all(name);
  }
  if(snapshot!==null){
    records.projects=await Promise.all(records.projects.map(cloudProjectDocument));
    records.trash=await Promise.all(records.trash.map(async row=>row.kind==='project'?{...row,item:await cloudProjectDocument(row.item)}:row));
  }
  const blobIDs=await backupBlobIDs({browserOnly});
  const {createZipBackup}=await import('./backup-archive.js');
  return createZipBackup({
    records,blobIDs,loadBlob:async id=>{
      const value=browserOnly?(await localDatabase()).get('blobs',id):get('blobs',id);
      return await value;
    },onChunk,onProgress,
    beforeFinalize:snapshot===null?null:async()=>{
      if(await cloudCheckpoint()!==snapshot)throw Error('云端资料在备份期间变化，请重新导出，未产生完整备份');
    }
  });
}
export async function restoreBackup(file){
  const header=new Uint8Array(await file.slice(0,4).arrayBuffer());
  const isZip=header.length>=4&&header[0]===0x50&&header[1]===0x4b&&header[2]===0x03&&header[3]===0x04;
  let values;
  if(isZip){
    const {readZipBackup}=await import('./backup-archive.js');
    values=await readZipBackup(file);
    validateRestoredRecords(values);
  }else{
    // Legacy JSON .shiyepwa remains importable; all new exports are ZIP.
    if(file.size>1024*1024*1024)throw Error('旧版 JSON 备份超过 1 GB，请先在桌面端转换');
    const data=JSON.parse(await file.text());
    await validateBackupData(data);
    values={...data.stores,blobs:data.stores.blobs.map(x=>({...x,data:fromBase64(x.data)}))};
  }
  // Validation completes BEFORE the first destructive write. The six IDB
  // stores are replaced in a single transaction; cloud CAS protects conflicts.
  await confirmedTransaction(STORES,tx=>{
    for(const name of STORES){
      tx.objectStore(name).clear();
      for(const item of values[name])tx.objectStore(name).put(item);
    }
  });
}

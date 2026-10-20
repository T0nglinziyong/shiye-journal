import {openDB} from 'idb';
import {createStorageRouter} from './storage-router.js';
import {cloudEnabled} from './cloud-session.js';
import {prepareProjectScene,partitionProjectList,attachSceneV2} from './scene-v2.js';
import {cloudRunExclusiveReset,cloudResetBaseline,cloudAbortExclusiveReset,cloudPurgeLocalAfterReset,cloudConflictReview,cloudConflictBackup,cloudResolveProjectConflict,cloudListPreConflictScenes,cloudRestorePreConflictScene,cloudMigrationInventory,cloudMigrationOriginalProject,cloudMigrationCommit,cloudLegacyProjectBackup,cloudAll,cloudGet,cloudReloadBlob,cloudTransaction,cloudStageMutation,cloudCheckpoint,cloudCachedCollections,cloudRefresh,cloudCheckVersion,cloudPreview,cloudPreviewCacheBytes,cloudClearPreviewCache,cloudStageProject,cloudStageImport,cloudPendingProjects,cloudPendingDetails,cloudSyncDiagnosticReport,cloudRecordSyncDiagnostic,cloudDiscardPending,cloudRebuildPending,cloudFlushProjects,cloudProjectDocument,cloudEmergencySnapshot,cloudRestoreEmergency,cloudBackupBlobIDs} from './cloud-store.js';
import {createPendingRecovery,parsePendingRecovery} from './emergency-backup.js';
// Exceptional destructive imports require an acknowledged atomic cloud commit.
export async function confirmedTransaction(names,fn){if(cloudEnabled){await cloudFlushProjects();return cloudTransaction(names,fn);}return transaction(names,fn);}
export async function stageImport(batch){if(cloudEnabled)return cloudStageImport(batch);await transaction(['assets','blobs','projects'],tx=>{for(const store of ['assets','blobs','projects'])for(const record of batch[store]||[])tx.objectStore(store).put(record);});return {pending:false};}
export const scanLegacyAccountData=()=>{if(!cloudEnabled)throw Error('此功能需要已登录的云端账号');return cloudMigrationInventory();};
export const readOriginalLegacyProject=record=>cloudMigrationOriginalProject(record);
export const commitLegacyAccountMigration=plan=>cloudMigrationCommit(plan);
export const stageProject=record=>{prepareProjectScene(record);return cloudEnabled?cloudStageProject(record):put('projects',record);};
export const pendingProjects=()=>cloudEnabled?cloudPendingProjects():Promise.resolve([]);
export const reviewSyncConflict=(kind,id)=>cloudConflictReview(kind,id);
export const backupSyncConflict=(kind,id)=>cloudConflictBackup(kind,id);
export const resolveSyncConflict=selection=>cloudResolveProjectConflict(selection);
export const listPreConflictScenes=()=>cloudListPreConflictScenes();
export const restorePreConflictScene=key=>cloudRestorePreConflictScene(key);
export const pendingSyncDetails=()=>cloudEnabled?cloudPendingDetails():Promise.resolve({projects:[],batches:[],error:null});
export const syncDiagnosticReport=options=>cloudEnabled?cloudSyncDiagnosticReport(options):null;
export const recordSyncDiagnostic=event=>{if(cloudEnabled)cloudRecordSyncDiagnostic(event);};
export async function createEmergencyBackup(){
  if(!cloudEnabled)throw Error('应急待同步备份仅适用于云端账号');
  return createPendingRecovery(await cloudEmergencySnapshot());
}
export async function restoreEmergencyBackup(file){
  if(!cloudEnabled)throw Error('应急恢复仅适用于云端账号');
  const parsed=await parsePendingRecovery(file);
  return cloudRestoreEmergency(parsed);
}
// Only used when a previously-saved image Blob cannot be decoded from
// IndexedDB. Refetches signed remote original bytes without changing metadata.
export const reloadCloudBlob=id=>cloudEnabled?cloudReloadBlob(id):get('blobs',id);
export const discardPendingSync=()=>cloudEnabled?cloudDiscardPending():Promise.resolve(0);
export const rebuildPendingSync=local=>cloudEnabled?cloudRebuildPending(local):Promise.resolve({replaced:0,pending:0});
export const runExclusiveAccountReset=task=>cloudEnabled?cloudRunExclusiveReset(task):Promise.reject(Error('此模式不支持云端清理'));
export const accountResetBaseline=()=>cloudEnabled?cloudResetBaseline():Promise.reject(Error('此模式不支持云端清理'));
export const abortExclusiveAccountReset=()=>{if(cloudEnabled)cloudAbortExclusiveReset();};
export async function purgeLocalAfterCloudReset(){
  if(!cloudEnabled)throw Error('只有已登录云端账号可以执行云端清空');
  await cloudPurgeLocalAfterReset();
  if(connection){const old=connection;connection=undefined;(await old).close();}
}
export const flushProjects=()=>cloudEnabled?cloudFlushProjects():Promise.resolve();
export const completeProject=record=>cloudEnabled?cloudProjectDocument(record):Promise.resolve(record);
let legacyProjectSummaries=[];
// Report the exact existing cloud rows that have been held aside. The rows
// remain on the server until the owner explicitly decides what to do with them.
export const legacyProjectInfo=()=>structuredClone(legacyProjectSummaries);
export const exportLegacyProjectBackup=()=>cloudEnabled?cloudLegacyProjectBackup():Promise.reject(Error('仅当前云端账号支持旧版作品原始备份')); 
function selectCurrentProjects(rows){
 const result=partitionProjectList(rows);
 legacyProjectSummaries=result.quarantined;
 return result.projects;
}
export async function cachedCollections(){
 const cached=cloudEnabled?await cloudCachedCollections():null;
 return cached?{...cached,projects:selectCurrentProjects(cached.projects)}:null;
}
export const refreshCloud=()=>cloudEnabled?cloudRefresh():Promise.resolve(null);
export const checkCloudVersion=()=>cloudEnabled?cloudCheckVersion():Promise.resolve(null);
export const previewBlob=(id,pixels=720,options)=>cloudEnabled?cloudPreview(id,pixels,options):get('blobs',id).then(r=>r?.data);
export const previewCacheBytes=()=>cloudEnabled?cloudPreviewCacheBytes():Promise.resolve(null);
export const clearPreviewCache=()=>cloudEnabled?cloudClearPreviewCache():Promise.resolve({count:0,bytes:0});
const DB='shiye-pwa-full-v1';
const STORES=['assets','blobs','series','projects','meta','trash'];
let connection;
// CloudBase is the sole remote backend. IndexedDB remains available for
// private offline caches, recoverable backups and pending write queues.
export async function storageMode(){return storageRouter.mode();}
async function localDatabase(){
 if(connection)return connection;
 connection=openDB(DB,1,{upgrade(db){for(const name of STORES)if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});}}).catch(error=>{connection=undefined;throw error;});
 return connection;
}
const storageRouter=createStorageRouter(
 async()=>{if(!cloudEnabled)throw Error('缺少 CloudBase 配置，停止数据操作；不创建独立浏览器数据源');return 'cloud';},
 {cloud:{all:cloudAll,get:cloudGet,transaction:cloudStageMutation}}
);
export async function all(name){const rows=await storageRouter.all(name);return name==='projects'?selectCurrentProjects(rows):rows;}
export async function get(name,id){const record=await storageRouter.get(name,id);return name==='projects'&&record?prepareProjectScene(record):record;}
export async function put(name,item){if(name==='projects')prepareProjectScene(item);return transaction([name],tx=>tx.objectStore(name).put(item));}
export async function remove(name,id){return transaction([name],tx=>tx.objectStore(name).delete(id));}
export const transaction=(names,fn)=>storageRouter.transaction(names,fn);
async function backupBlobIDs({browserOnly=false}={}){return cloudEnabled&&!browserOnly?cloudBackupBlobIDs():(await localDatabase()).getAllKeys('blobs');}
export async function createBackup({browserOnly=false,onChunk,onProgress=()=>{}}={}){
  const snapshot=cloudEnabled&&!browserOnly?await cloudCheckpoint():null;
  const records={};
  if(browserOnly||!cloudEnabled){
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
export async function prepareBackupRestore(file){
  const restoreAccountID=cloudEnabled?(await (await import('./cloud-session.js')).requireCloudUser()).id:null;
  const header=new Uint8Array(await file.slice(0,4).arrayBuffer());
  const isZip=header.length>=4&&header[0]===0x50&&header[1]===0x4b&&header[2]===0x03&&header[3]===0x04;
  if(!isZip)throw Error('请选择当前 .shiyepwa ZIP 完整备份；旧数据请使用独立转换工具');
  const {stageBackup}=await import('./backup-staging.js');
  const {validateRestoredRecords}=await import('./backup-integrity.js');
  const staged=await stageBackup(file),values=staged.stores;
  const repairs=[];
  try{validateRestoredRecords(values,{repairs});}catch(error){await staged.dispose();throw error;}
  const counts=Object.fromEntries(STORES.map(name=>[name,values[name].length]));
  let applied=false,applying=false,disposed=false;
  const dispose=async()=>{disposed=true;await staged.dispose();};
  return {counts,repairs,dispose,apply:async()=>{
    if(applied||applying||disposed)throw Error('此备份恢复任务已经执行或正在执行，请重新选择文件');
    applying=true;
    try{
    if(cloudEnabled){
      const current=(await (await import('./cloud-session.js')).requireCloudUser()).id;
      if(current!==restoreAccountID)throw Error('预检后登录账号已变化，请重新选择备份文件');
      await cloudFlushProjects();
      const pending=await cloudPendingDetails();
      if(pending.projects.length||pending.batches.length||pending.quarantined)
        throw Error('本账号仍有待同步或待检查的本机修改；请先完成同步或导出应急包，再恢复完整备份');
    }
    applied=true;
    // The six IDB stores are replaced in one transaction. A failed request
    // leaves the prior database intact; preflight itself never writes it.
    await confirmedTransaction(STORES,tx=>{
      for(const name of STORES){
        tx.objectStore(name).clear();
        for(const item of values[name])tx.objectStore(name).put(item);
      }
    });
    }finally{applying=false;await dispose();}
  }};
}
export async function restoreBackup(file){return (await prepareBackupRestore(file)).apply();}

import {readZipBackup} from './backup-archive.js';
import {BACKUP_BYTES_LIMIT} from './backup-limits.js';
const PREFIX='shiye-restore-';
// OPFS stages only verified recovery bytes. Live records remain untouched until
// the existing atomic six-store commit. Web Locks protect another tab's plan.
export async function stageBackup(file){
 if(file.size>BACKUP_BYTES_LIMIT)throw Error('ZIP 备份超过当前 2 GB 上限；原有资料未修改');
 const storage=globalThis.navigator?.storage;
 if(!storage?.getDirectory){
  if(file.size>256*1024*1024)throw Error('此浏览器不支持大型备份的磁盘暂存，请使用支持 OPFS 的 Safari 或 Chrome');
  return {stores:await readZipBackup(file),dispose:async()=>{}};
 }
 const root=await storage.getDirectory(),locks=globalThis.navigator?.locks;
 if(locks)for await(const [name] of root.entries()){
  if(!name.startsWith(PREFIX))continue;
  const created=Number(name.slice(PREFIX.length).split('-')[0]);
  if(!Number.isFinite(created)||Date.now()-created<86400000)continue;
  await locks.request(name,{ifAvailable:true},async lock=>{
   if(lock)await root.removeEntry(name,{recursive:true}).catch(()=>{});
  });
 }
 const estimate=await storage.estimate?.();
 if(estimate?.quota&&estimate.quota-(estimate.usage||0)<file.size*2.2)
  throw Error('本机空间不足以暂存并校验备份；原有资料未修改');
 const name=PREFIX+Date.now()+'-'+crypto.randomUUID();let unlock=()=>{},lease;
 if(locks){
  let ready,failed;const acquired=new Promise((resolve,reject)=>{ready=resolve;failed=reject;});
  lease=locks.request(name,()=>{ready();return new Promise(resolve=>{unlock=resolve;});});
  lease.catch(failed);await acquired;
 }
 let disposed=false;
 const dispose=async()=>{
  if(disposed)return;disposed=true;
  try{await root.removeEntry(name,{recursive:true});}
  catch(error){if(error.name!=='NotFoundError')console.warn('恢复暂存区将于下次维护清理');}
  finally{unlock();await lease;}
 };
 try{
  await root.getDirectoryHandle(name,{create:true});
  return {stores:await readZipBackup(file,{stagingName:name}),dispose};
 }catch(error){await dispose();throw error;}
}

// Runs only after the cloud endpoint confirms a complete user-scoped purge.
// Never trigger as an automatic error recovery or logout side effect.
const ownDatabase=name=>typeof name==='string'&&
  (/^shiye(?:-|$)/.test(name)||name==='shiye-pwa-full-v1');

export async function eraseSiteAppData({storage=localStorage,session=sessionStorage,
  idb=indexedDB,cacheStorage=globalThis.caches,serviceWorker=navigator.serviceWorker,
  preClose=()=>{}}={}){
 await preClose();
 const errors=[];
 // Close app databases before deleting to avoid IDB blocked events.
 const known=['shiye-pwa-full-v1','shiye-private-read-cache-v2',
   'shiye-offline-tasks-v1'];
 let enumerated=[];
 try{if(typeof idb.databases==='function')enumerated=(await idb.databases()).map(entry=>entry.name).filter(ownDatabase);}
 catch(error){errors.push('数据库枚举：'+error.message);}
 const names=[...new Set([...known,...enumerated])];
 for(const name of names){
   try{
     await new Promise((resolve,reject)=>{
       const request=idb.deleteDatabase(name);
       let timeout=setTimeout(()=>reject(Error('数据库 '+name+' 仍被其他标签页占用')),4500);
       request.onsuccess=()=>{clearTimeout(timeout);resolve();};
       request.onerror=()=>{clearTimeout(timeout);reject(request.error||Error('数据库删除失败'));};
       request.onblocked=()=>{ /* Wait until other tabs release their open handles. */ };
     });
   }catch(error){errors.push(error.message);}
 }
 if(cacheStorage)try{
   const keys=await cacheStorage.keys();
   for(const name of keys)if(/^shiye(?:-|$)/.test(name))await cacheStorage.delete(name);
 }catch(error){errors.push('页面缓存：'+error.message);}
 try{session.clear();}catch(error){errors.push('会话缓存：'+error.message);}
 try{storage.clear();}catch(error){errors.push('本机设置：'+error.message);}
 if(serviceWorker)try{
   const registrations=await serviceWorker.getRegistrations();
   for(const registration of registrations)await registration.unregister();
 }catch(error){errors.push('离线程序：'+error.message);}
 return {deletedDatabases:names.length,errors};
}

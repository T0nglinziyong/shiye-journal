import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Restore failure tests require localhost');
const b=await browserHarness('shiye-backup-staging',url);
try{
 await b.wait('.series-grid');
 const result=await b.evaluate(`(async()=>{
  const store=await import('/src/store.js'),{createZipBackup}=await import('/src/backup-archive.js');
  const records={assets:[],series:[],projects:[],trash:[],meta:[{id:'replacement',value:true}]};
  const file=await createZipBackup({records,blobIDs:[],loadBlob:async()=>null});
  const root=await navigator.storage.getDirectory();
  const count=async()=>{let n=0;for await(const [name] of root.entries())if(name.startsWith('shiye-restore-'))n++;return n;};
  await store.put('meta',{id:'original',value:'keep'});
  const canceled=await store.prepareBackupRestore(file);await canceled.dispose();
  if(await count())throw Error('Canceled restore leaked temporary directory');
  let canceledBlocked=false;try{await canceled.apply();}catch{canceledBlocked=true;}
  if(!canceledBlocked)throw Error('Canceled restore can still apply');
  const estimate=navigator.storage.estimate;
  navigator.storage.estimate=async()=>({quota:100,usage:99});
  let refused=false;try{await store.prepareBackupRestore(file);}catch(error){refused=/空间不足/.test(error.message);}finally{navigator.storage.estimate=estimate;}
  if(!refused)throw Error('Insufficient storage accepted');
  const plan=await store.prepareBackupRestore(file);
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(row,...args){if(row.id==='replacement')throw new DOMException('Injected storage quota failure','QuotaExceededError');return put.call(this,row,...args);};
  let failed=false;try{await plan.apply();}catch{failed=true;}finally{IDBObjectStore.prototype.put=put;}
  if(!failed)throw Error('Injected transaction failure did not abort');
  return {old:(await store.get('meta','original'))?.value,newValue:!!await store.get('meta','replacement'),temporary:await count()};
 })()`);
 assert.deepEqual(result,{old:'keep',newValue:false,temporary:0});
 await b.command('Page.reload');await b.wait('.series-grid');
 assert.equal(await b.evaluate(`(async()=>{const store=await import('/src/store.js');return (await store.get('meta','original'))?.value})()`),'keep');
 assert.deepEqual(b.errors,[]);console.log('Restore cancel, insufficient storage and atomic write failure preserve live data after reload');
}finally{await b.close();}

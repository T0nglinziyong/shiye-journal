import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('Large restore tests require isolated localhost');
const b=await browserHarness('shiye-large-backup',url);
try{
 await b.wait('.series-grid');
 const exported=await b.evaluate(`(async()=>{
  const {createZipBackup}=await import('/src/backup-archive.js');
  const root=await navigator.storage.getDirectory(),name='large-acceptance.zip';
  const handle=await root.getFileHandle(name,{create:true}),out=await handle.createWritable();
  const chunk=new Uint8Array(1024*1024);chunk[0]=23;chunk[chunk.length-1]=97;
  const data=new Blob(Array(258).fill(chunk),{type:'application/octet-stream'});
  const records={assets:[],blobs:[],projects:[],series:[],trash:[],meta:[{id:'large-test',value:true}]};
  let beats=0;const timer=setInterval(()=>beats++,20);
  try{await createZipBackup({records,blobIDs:['large-image'],loadBlob:async()=>({id:'large-image',data}),onChunk:bytes=>out.write(bytes)});await out.close();}
  finally{clearInterval(timer);}
  return {bytes:(await handle.getFile()).size,beats};
 })()`);
 assert.ok(exported.bytes>256*1024*1024);assert.ok(exported.beats>2,'streamed export must yield UI');
 const restored=await b.evaluate(`(async()=>{
  const store=await import('/src/store.js');
  const root=await navigator.storage.getDirectory(),file=await (await root.getFileHandle('large-acceptance.zip')).getFile();
  await store.put('meta',{id:'before-restore',value:true});
  let beats=0;const timer=setInterval(()=>beats++,20);
  try{
   const plan=await store.prepareBackupRestore(file);
   if(!(await store.get('meta','before-restore')))throw Error('Preflight changed live data');
   await plan.apply();
   const blob=await store.get('blobs','large-image');
   const first=new Uint8Array(await blob.data.slice(0,1).arrayBuffer())[0];
   const last=new Uint8Array(await blob.data.slice(-1).arrayBuffer())[0];
   let temporary=0;for await(const [name] of root.entries())if(name.startsWith('shiye-restore-'))temporary++;
   return {size:blob.data.size,first,last,beats,temporary,old:!!await store.get('meta','before-restore'),newValue:(await store.get('meta','large-test'))?.value};
  }finally{clearInterval(timer);await root.removeEntry('large-acceptance.zip');}
 })()`);
 assert.equal(restored.size,258*1024*1024);assert.equal(restored.first,23);assert.equal(restored.last,97);
 assert.equal(restored.old,false);assert.equal(restored.newValue,true);assert.equal(restored.temporary,0);assert.ok(restored.beats>2);
 await b.command('Page.reload');await b.wait('.series-grid');
 const persisted=await b.evaluate(`(async()=>{const store=await import('/src/store.js');const row=await store.get('blobs','large-image');return {size:row.data.size,first:new Uint8Array(await row.data.slice(0,1).arrayBuffer())[0],last:new Uint8Array(await row.data.slice(-1).arrayBuffer())[0]};})()`);
 assert.deepEqual(persisted,{size:258*1024*1024,first:23,last:97});
 assert.deepEqual(b.errors,[]);console.log('Large OPFS-backed ZIP export/atomic restore passed',exported,restored);
}catch(error){console.error(error);throw error;}finally{await b.close();}

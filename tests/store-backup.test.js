import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {webcrypto} from 'node:crypto';
test('full synthetic backup restores six stores and exact Blob bytes; failed restore stays atomic',async()=>{
  const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  globalThis.document={querySelector:()=>null};globalThis.location={origin:'http://localhost'};globalThis.crypto??=webcrypto;
  globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(v=>{this.result='data:'+blob.type+';base64,'+Buffer.from(v).toString('base64');this.onload();}).catch(e=>{this.error=e;this.onerror();});}};
  const previous=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:404});
  try{
    const store=await import('../src/store.js?backup-validation');
    const values={assets:[{id:'a',title:'synthetic',blobId:'b',originalBlobId:'b',supply:{quantity:3}}],blobs:[{id:'b',data:new Blob([new Uint8Array([0,1,127,255])],{type:'image/png'})}],series:[{id:'s',title:'synthetic series'}],projects:[{id:'p',drafts:[{id:'d',items:[{assetID:'a'}]}]}],meta:[{id:'m',value:false}],trash:[{id:'t',original:{id:'deleted'}}]};
    await store.transaction(Object.keys(values),tx=>{for(const [name,records] of Object.entries(values))for(const record of records)tx.objectStore(name).put(record);});
    const backup=await store.createBackup();await store.transaction(Object.keys(values),tx=>{for(const name of Object.keys(values))tx.objectStore(name).clear();});await store.restoreBackup(backup);
    for(const [name,records] of Object.entries(values)){const actual=await store.all(name);if(name==='blobs'){assert.deepEqual(new Uint8Array(await actual[0].data.arrayBuffer()),new Uint8Array([0,1,127,255]));assert.equal(actual[0].data.type,'image/png');}else assert.deepEqual(actual,records);}
    const corrupted=JSON.parse(await backup.text());corrupted.stores.assets=[{title:'missing primary key'}];await assert.rejects(store.restoreBackup(new Blob([JSON.stringify(corrupted)])));assert.deepEqual(await store.all('assets'),values.assets);assert.equal((await store.all('projects')).length,1);
    await assert.rejects(store.restoreBackup(new Blob(['{}'])),/完整备份/);assert.deepEqual(await store.all('assets'),values.assets);
  }finally{globalThis.fetch=previous;}
});

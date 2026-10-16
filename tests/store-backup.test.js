import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

test('ordinary restore refuses non-ZIP input without changing the current database',async()=>{
  const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)||null,
    setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
  globalThis.document={querySelector:()=>null};globalThis.location={origin:'http://localhost'};
  const oldFetch=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:404});
  try{
    const store=await import('../src/store.js?current-zip-only');
    await store.put('assets',{id:'current',title:'原有素材'});
    await assert.rejects(store.prepareBackupRestore(new Blob(['{"format":"shiye-pwa"}'])),/当前 .shiyepwa ZIP/);
    assert.equal((await store.get('assets','current')).title,'原有素材');
  }finally{globalThis.fetch=oldFetch;}
});

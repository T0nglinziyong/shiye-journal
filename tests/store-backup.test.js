import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

test('CloudBase-only store never falls back to a separate browser writer',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('must not probe an old backend');};
 try{
   const store=await import('../src/store.js?cloudbase-only-no-fallback');
   await assert.rejects(store.storageMode(),/CloudBase 配置缺失|缺少 CloudBase/);
   await assert.rejects(store.put('assets',{id:'legacy',title:'不可单独保存'}),/CloudBase 配置缺失|缺少 CloudBase/);
   await assert.rejects(store.prepareBackupRestore(new Blob(['{"format":"shiye-pwa"}'])),/当前 .shiyepwa ZIP/);
 }finally{globalThis.fetch=oldFetch;}
});

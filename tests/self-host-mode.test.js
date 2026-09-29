import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('protected same-origin server never falls back to IndexedDB',async()=>{
  const values=new Map(),calls=[];
  globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  globalThis.location={origin:'https://shiyejournal.vip'};
  globalThis.document={querySelector:()=>({content:'1'})};
  globalThis.fetch=async (url,options={})=>{calls.push({url,authorization:options.headers?.Authorization});return url.endsWith('/api/health')?{ok:true,json:async()=>({server:'shiye-local',protected:true})}:options.headers?.Authorization==='Bearer valid-secret'?{ok:true,json:async()=>([])}:{ok:false,status:401,json:async()=>({error:'需要有效的数据服务令牌'})};};
  const db=await import('../src/store.js?self-host-test');
  await assert.rejects(db.storageMode(),error=>error.status===401);
  assert.equal(db.isSameOriginServer(),true);
  db.setStorageConfig({url:location.origin,token:'valid-secret'});
  assert.equal(await db.storageMode(),'server');
  assert.equal(calls.at(-1).authorization,'Bearer valid-secret');
  db.setStorageConfig({url:'https://other.example',token:'valid-secret'});
  await assert.rejects(db.storageMode(),/只允许使用同域名/);
  const worker=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
  assert.match(worker,/u\.pathname\.startsWith\('\/api\/'\)/);
});

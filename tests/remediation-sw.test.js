import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('original TTF and OTF fonts remain available offline after first use',async()=>{
  const source=(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'))
    .replaceAll('__BUILD_ID__','test').replace('__ASSETS__','[]');
  const listeners=new Map(),stored=new Map();let online=true,requests=0;
  const self={location:{origin:'https://shiyejournal.vip'},addEventListener:(name,fn)=>listeners.set(name,fn)};
  const caches={open:async()=>({match:async req=>stored.get(req.url)?.clone(),put:async(req,response)=>stored.set(req.url,response)})};
  const fetch=async()=>{requests++;if(!online)throw Error('offline');return new Response('original-font-bytes');};
  vm.runInNewContext(source,{self,caches,fetch,Promise,URL,Response,Set});
  const load=async path=>{
    let response;const writes=[];
    listeners.get('fetch')({request:{url:'https://shiyejournal.vip'+path,method:'GET',mode:'cors'},respondWith:p=>response=p,waitUntil:p=>writes.push(p)});
    assert.ok(response,'font request must be intercepted');
    const value=await response;await Promise.all(writes);return value.text();
  };
  for(const path of ['/assets/HongLei-hash.otf','/assets/Like-hash.ttf'])assert.equal(await load(path),'original-font-bytes');
  online=false;
  for(const path of ['/assets/HongLei-hash.otf','/assets/Like-hash.ttf'])assert.equal(await load(path),'original-font-bytes');
  assert.equal(requests,2);
  assert.equal(stored.size,2);
});

test('M-06: worker activation deletes only obsolete Shiye shell caches',async()=>{
  const source=(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'))
    .replace('__BUILD_ID__','test').replace('__ASSETS__','[]');
  const listeners=new Map(),deleted=[];
  const caches={keys:async()=>['shiye-full-shell-old','shiye-full-shell-test','other-app-shell','shiye-model-v1'],delete:async key=>{deleted.push(key);return true;}};
  const self={addEventListener:(name,fn)=>listeners.set(name,fn),clients:{claim:async()=>{}}};
  vm.runInNewContext(source,{self,caches,Promise,URL,Response});
  let pending;
  listeners.get('activate')({waitUntil:promise=>pending=promise});
  await pending;
  assert.deepEqual(deleted,['shiye-full-shell-old']);
});

test('service worker does not replace an active editor during installation',async()=>{
 const source=(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'))
   .replace('__BUILD_ID__','test').replace('__ASSETS__',"['/','/index.html']");
 const listeners=new Map();let skip=0;
 const self={location:{origin:'https://shiyejournal.vip'},
   addEventListener:(name,fn)=>listeners.set(name,fn),skipWaiting:async()=>{skip++;},clients:{claim:async()=>{}}};
 const caches={open:async()=>({addAll:async()=>{}}),keys:async()=>[],delete:async()=>{}};
 vm.runInNewContext(source,{self,caches,Promise,URL,Response,Set});
 let pending;
 listeners.get('install')({waitUntil:p=>pending=p});
 await pending;assert.equal(skip,0);
 listeners.get('message')({data:{type:'SHIYE_ACTIVATE_UPDATE'},waitUntil:p=>pending=p});
 await pending;assert.equal(skip,1);
});

test('installation remains staged until the app requests activation',async()=>{
  const source=(await readFile(new URL('../public/sw.js',import.meta.url),'utf8')).replace('__BUILD_ID__','test').replace('__ASSETS__',"['/']");
  const listeners=new Map();let activations=0;
  const self={location:{origin:'https://shiyejournal.vip'},addEventListener:(name,fn)=>listeners.set(name,fn),
    skipWaiting:async()=>{activations++;},clients:{claim:async()=>{}}};
  const caches={open:async()=>({addAll:async()=>{}}),keys:async()=>[],delete:async()=>true};
  vm.runInNewContext(source,{self,caches,Promise,URL,Response,Set});
  let pending;
  listeners.get('install')({waitUntil:promise=>pending=promise});
  await pending;
  assert.equal(activations,0);
  listeners.get('message')({data:{type:'SHIYE_ACTIVATE_UPDATE'},waitUntil:promise=>pending=promise});
  await pending;
  assert.equal(activations,1);
});

test('multi-tab editor prevents an unsafe Service Worker takeover',async()=>{
  const source=(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'))
    .replace('__BUILD_ID__','test').replace('__ASSETS__',"['/']");
  const listeners=new Map(),messages=[];let skipped=0;
  const self={location:{origin:'https://shiyejournal.vip'},
    addEventListener:(name,fn)=>listeners.set(name,fn),
    clients:{claim:async()=>{},matchAll:async()=>[{id:'a'},{id:'b'}]},
    skipWaiting:async()=>{skipped++;}
  };
  const caches={open:async()=>({addAll:async()=>{}}),keys:async()=>[],delete:async()=>true};
  vm.runInNewContext(source,{self,caches,Promise,URL,Response,Set});
  let pending;
  listeners.get('message')({data:{type:'SHIYE_ACTIVATE_UPDATE'},
    source:{postMessage:message=>messages.push(message)},waitUntil:promise=>pending=promise});
  await pending;
  assert.equal(skipped,0);
  assert.equal(messages[0].type,'SHIYE_UPDATE_BLOCKED');
});

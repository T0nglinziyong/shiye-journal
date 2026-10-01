import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

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

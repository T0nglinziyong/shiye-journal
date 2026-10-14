import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {openDB} from 'idb';
import {createPrivateCache,mergeOutboxRows} from '../src/private-cache.js';

const row=(id,serial=1)=>({serial,baseRevision:2,operationID:id+'-'+serial,record:{id,title:'local-'+serial}});
test('two tabs adding different offline edits preserve both operations',async()=>{
  const cache=createPrivateCache({name:'shiye-outbox-two-tabs'});
  const account='cloud:account',kind='project-outbox';
  const first=[row('project-A')],second=[row('project-B')];
  await cache.putOutbox(account,kind,[],first);
  await cache.putOutbox(account,kind,[],second);
  assert.deepEqual((await cache.get(account,kind)).map(r=>r.record.id).sort(),['project-A','project-B']);
  // A's successful acknowledgement must not erase B's pending operation.
  await cache.putOutbox(account,kind,first,[]);
  assert.deepEqual((await cache.get(account,kind)).map(r=>r.record.id),['project-B']);
});
test('stale tab cannot silently replace a pending edit to the same document',async()=>{
  const cache=createPrivateCache({name:'shiye-outbox-same-document'});
  const account='cloud:account',kind='project-outbox';
  await cache.putOutbox(account,kind,[],[row('same',1)]);
  await assert.rejects(cache.putOutbox(account,kind,[],[row('same',2)]),/其他标签页/);
  assert.equal((await cache.get(account,kind))[0].serial,1);
});
test('acknowledgements cannot delete newer pending edits from another tab',()=>{
  const old=row('same',1),replacement=row('same',2);
  assert.deepEqual(mergeOutboxRows([replacement],[old],[]),[replacement]);
  assert.deepEqual(mergeOutboxRows([old,row('other')],[old],[row('new')]).map(x=>x.record.id).sort(),['new','other']);
});
test('import queue merge keeps untouched operations after independent writes',async()=>{
  const cache=createPrivateCache({name:'shiye-outbox-import'});
  const account='cloud:account',kind='import-outbox';
  await cache.putOutbox(account,kind,[],[row('batch-one')]);
  await cache.putOutbox(account,kind,[],[row('batch-two')]);
  assert.equal((await cache.get(account,kind)).length,2);
});
test('large existing outbox is preserved while later edits write only their own rows',async()=>{
  const name='shiye-outbox-row-journal',account='cloud:large',kind='unified-outbox';
  const first={...row('old'),record:{id:'old',data:new Blob([new Uint8Array(1024*1024)])}};
  const d=await openDB(name,1,{upgrade(db){db.createObjectStore('entries',{keyPath:'key'});db.createObjectStore('sizes',{keyPath:'key'});}});
  const aggregateKey=JSON.stringify([account,kind]);
  await d.put('entries',{key:aggregateKey,account,value:[first]});d.close();
  const cache=createPrivateCache({name});
  assert.equal((await cache.get(account,kind))[0].record.data.size,1024*1024);
  await cache.putOutbox(account,kind,[first],[first,row('new')]);
  assert.equal((await cache.get(account,kind)).length,2);
  assert.equal((await cache.migrateUnifiedOutbox(account)).rows.length,2);
  const check=await openDB(name,1);
  assert.equal((await check.get('entries',aggregateKey)).value[0].record.data.size,1024*1024);
  check.close();
  await cache.putOutbox(account,kind,[first,row('new')],[row('new')]);
  assert.deepEqual((await cache.get(account,kind)).map(x=>x.record.id),['new']);
  const after=await openDB(name,1);
  assert.equal(await after.get('entries',aggregateKey),undefined);
  after.close();await cache.close();
});
test('many Blob imports can be staged and acknowledged without rewriting an aggregate',async()=>{
  const name='shiye-outbox-many-blobs',account='cloud:many',kind='unified-outbox';
  const cache=createPrivateCache({name});
  let previous=[];
  for(let index=0;index<26;index++){
    const next=[...previous,{...row('batch-'+index),record:{id:'batch-'+index,
      data:new Blob([new Uint8Array(256*1024)])}}];
    await cache.putOutbox(account,kind,previous,next);previous=next;
  }
  assert.equal((await cache.get(account,kind)).length,26);
  const d=await openDB(name,1);
  assert.equal(await d.get('entries',JSON.stringify([account,kind])),undefined);
  d.close();
  await cache.putOutbox(account,kind,previous,[]);
  assert.deepEqual(await cache.get(account,kind),[]);
  await cache.close();
});

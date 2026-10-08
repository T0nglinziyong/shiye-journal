import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
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

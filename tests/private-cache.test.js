import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {openDB} from 'idb';
import {createPrivateCache,outboxVersionRows} from '../src/private-cache.js';
test('retry metadata remains in the lightweight outbox compare baseline',async()=>{
  const cache=createPrivateCache({name:'private-cache-retry-baseline-'+Date.now()});
  const row={record:{id:'batch:one',data:new Blob(['image bytes'])},serial:4,
    baseRevision:9,operationID:'attempt-1',attempt:2,nextAttemptAt:1234,
    lastFailureClass:'transient'};
  await cache.putOutbox('user','unified-outbox',[],[row]);
  const baseline=outboxVersionRows([row]);
  assert.deepEqual(baseline[0].record,{id:'batch:one'});
  const updated={...row,baseRevision:10,attempt:undefined,
    nextAttemptAt:undefined,lastFailureClass:undefined};
  await cache.putOutbox('user','unified-outbox',baseline,[updated]);
  assert.equal((await cache.get('user','unified-outbox'))[0].baseRevision,10);
});
test('persistent private cache isolates accounts and enforces its byte limit',async()=>{
  const name='private-cache-test-'+Date.now(),a=createPrivateCache({name,limit:8});
  await a.put('user-a','records',{revision:4});await a.put('user-b','records',{revision:5});
  await a.put('user-a','image:first',new Blob(['123456']));await a.put('user-a','image:second',new Blob(['abcdef']));
  assert.equal(await a.get('user-a','image:first'),undefined);assert.equal(await (await a.get('user-a','image:second')).text(),'abcdef');
  const reopened=createPrivateCache({name});assert.deepEqual(await reopened.get('user-a','records'),{revision:4});await reopened.clear('user-a');assert.equal(await a.get('user-a','records'),undefined);assert.deepEqual(await a.get('user-b','records'),{revision:5});
});
test('collection revision head advances without rewriting unchanged catalog rows',async()=>{
  const name='private-cache-snapshot-head-'+Date.now();
  const cache=createPrivateCache({name});
  const first=new Map(['assets','series','projects','trash','meta','blobs'].map(store=>
    [store,{revision:1,records:[{id:store}]}]));
  assert.equal(await cache.putSnapshotBatch('a',0,1,first,['assets']),true);
  const next=new Map([...first].map(([store,snapshot])=>[store,
    {revision:2,records:store==='projects'?[{id:'updated'}]:snapshot.records}]));
  assert.equal(await cache.putSnapshotBatch('a',1,2,next,['projects']),true);
  const raw=await openDB(name,1);
  assert.equal((await raw.get('entries',JSON.stringify(['a','records:assets']))).value.revision,1,
    'the unchanged asset catalog is not cloned into IndexedDB again');
  raw.close();
  assert.deepEqual(await cache.get('a','records:projects'),next.get('projects'));
  assert.deepEqual(await cache.get('a','records:assets'),next.get('assets'));
  assert.equal(await cache.putSnapshotBatch('a',1,3,next,['assets']),false,
    'a stale tab cannot move the read cache backwards');
  const reopened=createPrivateCache({name});
  assert.deepEqual(await reopened.get('a','records:assets'),next.get('assets'));
  assert.deepEqual(await reopened.get('a','records:projects'),next.get('projects'));
  const jump=new Map([...next].map(([store,snapshot])=>[store,{...snapshot,revision:7}]));
  assert.equal(await reopened.putSnapshotBatch('a',6,7,jump,['series']),true,
    'a verified full reload can rebuild an older revision head');
  assert.deepEqual(await cache.get('a','records:assets'),jump.get('assets'));
});
test('a newly cached original evicts originals before already loaded thumbnails',async()=>{
  const name='private-cache-preview-'+Date.now(),cache=createPrivateCache({name,limit:12});
  await cache.put('user','thumbnail480:user/material.webp',new Blob(['preview']));
  await cache.put('user','image:first',new Blob(['original']));
  assert.equal(await cache.get('user','image:first'),undefined);
  assert.equal(await (await cache.get('user','thumbnail480:user/material.webp')).text(),'preview');
});
test('large detail variants are evicted before fixed card previews',async()=>{
  const cache=createPrivateCache({name:'private-cache-tiers-'+Date.now(),limit:12});
  await cache.put('user','thumbnail480:user/material.webp',new Blob(['preview']));
  await cache.put('user','preview960:user/material.webp',new Blob(['variant']));
  assert.equal(await cache.get('user','preview960:user/material.webp'),undefined);
  assert.equal((await cache.get('user','thumbnail480:user/material.webp')).size,7);
});
test('logout clears disposable reads but preserves account-scoped pending edits',async()=>{
  const name='private-cache-logout-'+Date.now(),cache=createPrivateCache({name});
  const pending=new Blob(['uncommitted photo']);
  await cache.put('user-a','project-outbox',[{record:{id:'draft-a'}}]);
  await cache.put('user-a','import-outbox',[{record:{id:'import-a',data:pending}}]);
  await cache.put('user-a','records:assets',{revision:2});
  await cache.put('user-b','records:assets',{revision:3});
  await cache.clear('user-a');
  const reopened=createPrivateCache({name});
  assert.deepEqual(await reopened.get('user-a','project-outbox'),[{record:{id:'draft-a'}}]);
  assert.equal(await (await reopened.get('user-a','import-outbox'))[0].record.data.text(),'uncommitted photo');
  assert.equal(await reopened.get('user-a','records:assets'),undefined);
  assert.deepEqual(await reopened.get('user-b','records:assets'),{revision:3});
});
test('preview cleanup reports exact bytes and leaves originals, documents and pending edits',async()=>{
  const cache=createPrivateCache({name:'private-cache-clean-'+Date.now()});
  await cache.put('a','thumbnail480:a/cover',new Blob(['1234']));
  await cache.put('a','preview960:a/photo',new Blob(['123456']));
  await cache.put('a','image:a/photo',new Blob(['original']));
  await cache.put('a','project-document:a/work',new Blob(['document']));
  await cache.put('a','unified-outbox',[{record:{id:'project:w'}}]);
  await cache.put('b','thumbnail480:b/cover',new Blob(['other']));
  assert.equal(await cache.previewBytes('a'),10);
  assert.deepEqual(await cache.clearPreviews('a'),{count:2,bytes:10});
  assert.equal(await cache.previewBytes('a'),0);
  assert.equal(await cache.get('a','thumbnail480:a/cover'),undefined);
  assert.equal((await cache.get('a','image:a/photo')).size,8);
  assert.equal((await cache.get('a','project-document:a/work')).size,8);
  assert.deepEqual(await cache.get('a','unified-outbox'),[{record:{id:'project:w'}}]);
  assert.equal((await cache.get('b','thumbnail480:b/cover')).size,5);
});

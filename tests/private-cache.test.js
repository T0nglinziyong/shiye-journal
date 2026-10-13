import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {createPrivateCache} from '../src/private-cache.js';
test('persistent private cache isolates accounts and enforces its byte limit',async()=>{
  const name='private-cache-test-'+Date.now(),a=createPrivateCache({name,limit:8});
  await a.put('user-a','records',{revision:4});await a.put('user-b','records',{revision:5});
  await a.put('user-a','image:first',new Blob(['123456']));await a.put('user-a','image:second',new Blob(['abcdef']));
  assert.equal(await a.get('user-a','image:first'),undefined);assert.equal(await (await a.get('user-a','image:second')).text(),'abcdef');
  const reopened=createPrivateCache({name});assert.deepEqual(await reopened.get('user-a','records'),{revision:4});await reopened.clear('user-a');assert.equal(await a.get('user-a','records'),undefined);assert.deepEqual(await a.get('user-b','records'),{revision:5});
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

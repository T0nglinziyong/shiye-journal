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
  await cache.put('user','thumbnail:first',new Blob(['preview']));
  await cache.put('user','image:first',new Blob(['original']));
  assert.equal(await cache.get('user','image:first'),undefined);
  assert.equal(await (await cache.get('user','thumbnail:first')).text(),'preview');
});

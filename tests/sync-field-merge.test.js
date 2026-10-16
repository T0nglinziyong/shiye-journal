import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeDisjointMetadata} from '../src/sync-field-merge.js';

test('independent material fields preserve both device edits',()=>{
  const base={id:'a',title:'原名',tags:['旧'],isFavorite:false,blobId:'image-1',physicalWidthMM:40};
  const local={...base,title:'新名字',updatedAt:'2026-10-16T10:00:00Z'};
  const remote={...base,tags:['远端标签'],updatedAt:'2026-10-16T10:01:00Z'};
  const result=mergeDisjointMetadata(base,local,remote);
  assert.equal(result.changed,true);
  assert.equal(result.record.title,'新名字');
  assert.deepEqual(result.record.tags,['远端标签']);
  assert.equal(result.record.updatedAt,remote.updatedAt);
});
test('cutout image and physical dimensions stay one atomic conflict group',()=>{
  const base={id:'a',blobId:'old-image',physicalWidthMM:40,title:'old'};
  const local={...base,physicalWidthMM:60};
  const remote={...base,blobId:'new-image'};
  assert.equal(mergeDisjointMetadata(base,local,remote),null);
});
test('same-field competition remains unresolved and an unchanged local value uses cloud',()=>{
  const base={id:'a',title:'old',tags:[]};
  assert.equal(mergeDisjointMetadata(base,{...base,title:'phone'},
    {...base,title:'tablet'}),null);
  assert.deepEqual(mergeDisjointMetadata(base,base,{...base,title:'tablet'}),{
    record:{...base,title:'tablet'},changed:false});
});
test('missing cloud record cannot be recreated by a stale metadata save',()=>{
  const base={id:'a',title:'old'};
  assert.equal(mergeDisjointMetadata(base,{...base,title:'phone'},null),null);
});

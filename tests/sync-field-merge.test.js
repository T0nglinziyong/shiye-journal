import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeDisjointMetadata,mergeConcurrentMetadata,stampMetadataEdit} from '../src/sync-field-merge.js';

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
test('same field picks the newer edit and keeps unrelated fields from both branches',()=>{
  const base={id:'a',title:'old',tags:['old'],updatedAt:'2026-10-15T10:00:00Z'};
  const local={...base,title:'phone',tags:['new tag'],updatedAt:'2026-10-15T10:02:00Z'};
  const remote={...base,title:'tablet',updatedAt:'2026-10-15T10:01:00Z'};
  assert.deepEqual(mergeConcurrentMetadata(base,local,remote),{record:local,changed:true});
  assert.deepEqual(mergeConcurrentMetadata(base,remote,local),{record:local,changed:false});
});
test('image and dimensions are won as an atomic group, with a stable retry decision',()=>{
  const base={id:'a',blobId:'old',physicalWidthMM:40,title:'old',updatedAt:'2026-10-15T10:00:00Z'};
  const local={...base,physicalWidthMM:60,title:'phone',updatedAt:'2026-10-15T10:02:00Z'};
  const remote={...base,blobId:'new',title:'tablet',updatedAt:'2026-10-15T10:01:00Z'};
  const answer=mergeConcurrentMetadata(base,local,remote);
  assert.equal(answer.record.blobId,'old');
  assert.equal(answer.record.physicalWidthMM,60);
  assert.equal(answer.record.title,'phone');
  assert.deepEqual(mergeConcurrentMetadata(base,local,remote),answer);
});
test('equal or absent edit times decide deterministically without retry timestamps',()=>{
  const base={id:'a',title:'old'};
  const phone={...base,title:'phone'},tablet={...base,title:'tablet'};
  const a=mergeConcurrentMetadata(base,phone,tablet).record.title;
  const b=mergeConcurrentMetadata(base,tablet,phone).record.title;
  assert.equal(a,b);
});
test('field stamps keep concurrent edits independent of a device clock in the future',()=>{
  const base={id:'a',title:'old',tags:['old'],updatedAt:'2026-10-15T00:00:00Z'};
  const phone=stampMetadataEdit(base,{...base,title:'phone',updatedAt:'2038-01-01T00:00:00Z'},'a-phone');
  const tablet=stampMetadataEdit(base,{...base,title:'tablet',tags:['new'],
    updatedAt:'2026-10-16T00:00:00Z'},'z-tablet');
  const result=mergeConcurrentMetadata(base,phone,tablet);
  assert.equal(result.record.title,'tablet');
  assert.deepEqual(result.record.tags,['new']);
  assert.deepEqual(mergeConcurrentMetadata(base,tablet,phone).record.title,'tablet');
  const later=stampMetadataEdit(result.record,{...result.record,title:'causal edit'},'later');
  assert.equal(later.__syncFieldStamps.title.counter,2);
  assert.equal(mergeConcurrentMetadata(base,later,phone).record.title,'causal edit');
});
test('disjoint stamped groups keep both causal clocks and retries keep the same stamp',()=>{
  const base={id:'a',title:'old',tags:['old']};
  const title=stampMetadataEdit(base,{...base,title:'new'},'title-op');
  const tags=stampMetadataEdit(base,{...base,tags:['new']},'tag-op');
  const merged=mergeConcurrentMetadata(base,title,tags).record;
  assert.equal(merged.title,'new');
  assert.deepEqual(merged.tags,['new']);
  assert.deepEqual(merged.__syncFieldStamps,{title:{counter:1,id:'title-op'},tags:{counter:1,id:'tag-op'}});
  assert.deepEqual(stampMetadataEdit(base,base,'no-op'),base);
  assert.deepEqual(stampMetadataEdit(base,{...base,title:'new'},'title-op'),title);
});
test('identical concurrent values retain the later causal stamp',()=>{
  const base={id:'a',title:'old'};
  const earlier=stampMetadataEdit(base,{...base,title:'same'},'a');
  const later=stampMetadataEdit(base,{...base,title:'same'},'z');
  assert.equal(mergeConcurrentMetadata(base,earlier,later).record.__syncFieldStamps.title.id,'z');
  assert.equal(mergeConcurrentMetadata(base,later,earlier).record.__syncFieldStamps.title.id,'z');
});

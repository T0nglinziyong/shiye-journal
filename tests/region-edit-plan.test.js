import test from 'node:test';
import assert from 'node:assert/strict';
import {planRegionMerge,planRegionSplit,findCachedRegion,planRegionAdd,regionMergeWarning} from '../src/region-edit-plan.js';

const frame={segmentationFrameWidth:20,segmentationFrameHeight:20,segmentationMethod:'sam2-small'};
const region=(x,y,w,h)=>({...frame,x:x/20,y:y/20,w:w/20,h:h/20,pixels:w*h,
  mask:{width:w,height:h,alpha:new Uint8Array(w*h).fill(255)}});

test('merge previews the carrier and split restores the original masks without modifying current candidates',()=>{
  const original=[region(2,2,2,2),region(6,2,2,2),region(14,2,2,2)];
  const merged=planRegionMerge(original,[0,1],[],{width:20,height:20});
  assert.equal(original.length,3);
  assert.equal(merged.regions.length,2);
  assert.deepEqual(merged.highlight,[1]);
  const split=planRegionSplit(merged.regions,1);
  assert.equal(split.regions.length,3);
  assert.deepEqual(split.highlight,[1,2]);
  assert.equal(split.regions[0],original[2]);
  assert.equal(planRegionSplit(original,0),null);
});

test('cached hidden mask can be added through a point or box with parent remainder retained',()=>{
  const child=region(3,3,2,2),parent=region(2,2,8,8);
  const displayed=[parent,region(14,2,2,2)];
  const point=findCachedRegion(displayed,[child],{x:3.5/20,y:3.5/20});
  assert.equal(point.region,child);
  const box=findCachedRegion(displayed,[child],null,{x:3/20,y:3/20,w:2/20,h:2/20});
  assert.equal(box.region,child);
  const draft=planRegionAdd(displayed,child,0);
  assert.equal(draft.regions.length,3);
  assert.equal(draft.regions.at(-1).pixels,4);
  assert.equal(draft.regions.at(-2).pixels,60);
  assert.equal(displayed[0],parent);
  assert.throws(()=>planRegionAdd(displayed,displayed[1]),/已经在候选/);
});

test('oversized merge remains available but receives muted styling guidance',()=>{
  const first=region(1,1,2,2),second=region(16,1,2,2);
  assert.equal(regionMergeWarning([first,second],[0,1]),true);
  assert.equal(regionMergeWarning([first,second],[0]),false);
});

test('same bounds with different mask pixels can still be recovered',()=>{
  const visible=region(2,2,4,4),hidden=region(2,2,4,4);
  hidden.mask.alpha.fill(0);hidden.mask.alpha[5]=255;hidden.mask.alpha[6]=255;
  const hit=findCachedRegion([visible],[hidden],{x:3.5/20,y:3.5/20});
  assert.equal(hit?.region,hidden);
});

test('hidden masks remain findable after their first parent is edited',()=>{
  const parent=region(2,2,8,8),first=region(3,3,2,2),second=region(7,7,2,2);
  parent.splitSources=[first,second];
  const remaining=region(2,2,8,8);
  remaining.mask.alpha[9]=0;
  const hit=findCachedRegion([remaining,first],[parent],{x:7.5/20,y:7.5/20});
  assert.equal(hit?.region,second);
});

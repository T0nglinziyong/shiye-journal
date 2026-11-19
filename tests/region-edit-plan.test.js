import test from 'node:test';
import assert from 'node:assert/strict';
import {planRegionMerge,planRegionSplit,regionMergeWarning} from '../src/region-edit-plan.js';

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

test('oversized merge remains available but receives muted styling guidance',()=>{
  const first=region(1,1,2,2),second=region(16,1,2,2);
  assert.equal(regionMergeWarning([first,second],[0,1]),true);
  assert.equal(regionMergeWarning([first,second],[0]),false);
});

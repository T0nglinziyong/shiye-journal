import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSamRegions} from '../src/sam-region-merge.js';
import {splitSources,splitBySource,subtractRegion,findSourceAt,findSourceInBox} from '../src/sam-region-split.js';
import {expandSavedRegions} from '../src/sam-postprocess.js';
import {softenOutputAlpha} from '../src/image.js';

const frame={segmentationFrameWidth:12,segmentationFrameHeight:8,segmentationMethod:'sam2-small'};
const region=(x,y,w,h)=>({...frame,x:x/12,y:y/8,w:w/12,h:h/8,pixels:w*h,
  mask:{width:w,height:h,alpha:new Uint8Array(w*h).fill(255)}});

test('a carrier retains its original masks for local split and grouping toggle',()=>{
  const first=region(1,1,2,2),second=region(6,1,2,2);
  const parent=mergeSamRegions([first,second],[0,1]);
  assert.deepEqual(splitSources(parent),[first,second]);
  assert.equal(findSourceAt(splitSources(parent),1.5/12,1.5/8),0);
  assert.equal(findSourceInBox(splitSources(parent),{x:6/12,y:1/8,w:2/12,h:2/8}),1);
  const [child,remainder]=splitBySource(parent,0);
  assert.deepEqual(child.mask.alpha,first.mask.alpha);
  assert.equal(child.x,first.x);
  assert.deepEqual(remainder.mask.alpha,second.mask.alpha);
  assert.equal(remainder.x,second.x);
  assert.deepEqual(expandSavedRegions(parent),[first,second]);
});

test('local prompt must leave a meaningful remainder',()=>{
  const parent=region(1,1,6,4),child=region(2,2,2,2);
  const rest=subtractRegion(parent,child);
  assert.equal(rest.pixels,20);
  assert.throws(()=>subtractRegion(parent,parent),/整个对象/);
  assert.throws(()=>subtractRegion(parent,region(9,1,2,2)),/有效区域/);
});

test('output antialiasing creates subpixel alpha without mutating source mask',()=>{
  const raw=Uint8Array.from([0,0,0,0,255,0,0,0,0]);
  const result=softenOutputAlpha(raw,3,3);
  assert.equal(raw[4],255);
  assert.ok(result[4]<255&&result[4]>0);
  assert.ok(result[1]>0);
});

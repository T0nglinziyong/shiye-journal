import test from 'node:test';
import assert from 'node:assert/strict';
import {samInputSize,samInputBox} from '../src/sam-input.js';
import {mergeSamRegions} from '../src/sam-region-merge.js';

test('SAM input preserves A4 orientation and maps manual boxes',()=>{
  assert.deepEqual(samInputSize(4096,2897),{width:1024,height:724});
  assert.deepEqual(samInputSize(2897,4096),{width:724,height:1024});
  assert.deepEqual(samInputBox([1024,1000,2048,2000],{width:4096,height:2897},
    {width:1024,height:724}),[256,249,512,500]);
});

test('merging SAM regions preserves gaps and holes in transparent masks',()=>{
  const frame={segmentationFrameWidth:8,segmentationFrameHeight:4,segmentationMethod:'sam2-small'};
  const regions=[
    {...frame,x:0,y:0,w:3/8,h:3/4,mask:{width:3,height:3,alpha:Uint8Array.from([255,255,255,255,0,255,255,255,255])}},
    {...frame,x:5/8,y:0,w:3/8,h:3/4,mask:{width:3,height:3,alpha:Uint8Array.from([255,255,255,255,255,255,255,255,255])}}
  ];
  const merged=mergeSamRegions(regions,[0,1]);
  assert.equal(merged.mask.width,8);
  assert.equal(merged.mask.height,3);
  assert.equal(merged.mask.alpha[1*8+1],0);
  assert.equal(merged.mask.alpha[1*8+4],0);
  assert.equal(merged.mask.alpha[1*8+6],255);
  assert.equal(merged.pixels,17);
});

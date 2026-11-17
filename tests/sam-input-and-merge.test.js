import test from 'node:test';
import assert from 'node:assert/strict';
import {samInputSize,samInputBox} from '../src/sam-input.js';
import {mergeSamRegions} from '../src/sam-region-merge.js';
import {mergeSharedCarriers} from '../src/sam-postprocess.js';

test('SAM input preserves A4 orientation and maps manual boxes',()=>{
  assert.deepEqual(samInputSize(4096,2897),{width:1024,height:724});
  assert.deepEqual(samInputSize(2897,4096),{width:724,height:1024});
  assert.deepEqual(samInputSize(700,990),{width:724,height:1024});
  assert.deepEqual(samInputBox([1024,1000,2048,2000],{width:4096,height:2897},
    {width:1024,height:724}),[256,249,512,500]);
});

test('merging selected regions includes their shared background',()=>{
  const frame={segmentationFrameWidth:8,segmentationFrameHeight:4,segmentationMethod:'sam2-small'};
  const regions=[
    {...frame,x:0,y:0,w:3/8,h:3/4,mask:{width:3,height:3,alpha:Uint8Array.from([255,255,255,255,0,255,255,255,255])}},
    {...frame,x:5/8,y:0,w:3/8,h:3/4,mask:{width:3,height:3,alpha:Uint8Array.from([255,255,255,255,255,255,255,255,255])}}
  ];
  const merged=mergeSamRegions(regions,[0,1]);
  assert.equal(merged.mask.width,8);
  assert.equal(merged.mask.height,3);
  assert.equal(merged.mask.alpha[1*8+1],255);
  assert.equal(merged.mask.alpha[1*8+4],255);
  assert.equal(merged.mask.alpha[1*8+6],255);
  assert.equal(merged.pixels,24);
  assert.equal(merged.mergeBasis,'enclosing-background');
});

test('detected carrier absorbs all child print regions and keeps the card outline',()=>{
  const frame={segmentationFrameWidth:10,segmentationFrameHeight:6,segmentationMethod:'sam2-small'};
  const child=(x,y)=>({...frame,x:x/10,y:y/6,w:.1,h:1/6,
    mask:{width:1,height:1,alpha:Uint8Array.of(255)}});
  const regions=[child(2,2),child(5,2),child(7,3),child(0,0)];
  const background={...frame,x:.1,y:1/6,w:.8,h:4/6,
    mask:{width:8,height:4,alpha:Uint8Array.from(Array(32).fill(255))}};
  const merged=mergeSamRegions(regions,[0,1],[background]);
  assert.equal(merged.mergeBasis,'sam-background');
  assert.deepEqual(merged.absorbedIndices,[0,1,2]);
  assert.equal(merged.mask.width,8);
  assert.equal(merged.mask.height,4);
  assert.equal(merged.pixels,32);
});

test('automatic carrier grouping uses child structure rather than paper brightness',()=>{
  const frame={segmentationFrameWidth:100,segmentationFrameHeight:100,segmentationMethod:'sam2-small'};
  const child=(x,y,size=5)=>({...frame,x:x/100,y:y/100,w:size/100,h:size/100,
    mask:{width:size,height:size,alpha:new Uint8Array(size*size).fill(255)}});
  const background=(x)=>({...frame,x:x/100,y:.1,w:.25,h:.25,
    mask:{width:25,height:25,alpha:new Uint8Array(625).fill(255)}});
  const raw=[child(12,13),child(23,15),child(52,13),child(63,15)];
  const joined=mergeSharedCarriers(raw,[background(10),background(50)]);
  assert.equal(joined.length,2);
  assert.ok(joined.every(region=>region.manuallyMerged));
  const distinct=[child(12,13,12),child(24,13,10)];
  assert.deepEqual(mergeSharedCarriers(distinct,[background(10)]),distinct,
    'large pieces on a shared carrier remain separate');
});

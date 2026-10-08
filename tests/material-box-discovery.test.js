import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';

test('a frame-connected paper residue does not enlarge an evidence-backed material box',async()=>{
  const cv=await cvModule,w=210,h=297,mask=new Uint8Array(w*h),evidence=new Uint8Array(w*h),foregroundSeeds=new Uint8Array(w*h);
  for(let y=3;y<43;y++)for(let x=55;x<181;x++)mask[y*w+x]=1;
  for(let y=40;y<96;y++)for(let x=125;x<181;x++){
    const i=y*w+x;mask[i]=1;evidence[i]=1;foregroundSeeds[i]=1;
  }
  const boxes=await processVision(cv,'boxes-simple',{mask,evidence,foregroundSeeds,width:w,height:h,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(boxes.length,1);
  assert.equal(boxes[0].boxAdjustment,'evidence-supported-frame-body');
  assert.ok(boxes[0].x>.50&&boxes[0].y>.10,'unsupported paper extension is excluded');
  assert.ok(boxes[0].x+boxes[0].w>.85&&boxes[0].y+boxes[0].h>.32,'the material remains fully inside the box');
});

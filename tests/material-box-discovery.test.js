import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';

test('box discovery keeps an ordinary physical material without evidence-based trimming',async()=>{
  const cv=await cvModule,w=210,h=297,mask=new Uint8Array(w*h),evidence=new Uint8Array(w*h),foregroundSeeds=new Uint8Array(w*h);
  for(let y=60;y<120;y++)for(let x=55;x<110;x++){
    const i=y*w+x;mask[i]=1;evidence[i]=1;foregroundSeeds[i]=1;
  }
  const boxes=await processVision(cv,'boxes-simple',{mask,evidence,foregroundSeeds,width:w,height:h,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(boxes.length,1);
  assert.equal(boxes[0].boxAdjustment,'raw');
  assert.ok(boxes[0].x<=55/w&&boxes[0].x+boxes[0].w>=110/w);
  assert.ok(boxes[0].y<=60/h&&boxes[0].y+boxes[0].h>=120/h);
});

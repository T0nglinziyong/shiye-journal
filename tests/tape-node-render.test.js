import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from 'canvas';
import {paintTapeStrip} from '../src/tape-strip.js';

test('tape pixel cropping and rotation work without document for both source axes',()=>{
 assert.equal(typeof document,'undefined');
 const image=createCanvas(100,40),brush=image.getContext('2d');
 brush.fillStyle='#217a40';brush.fillRect(20,10,60,20);
 // Reuse one image across axes to exercise the prepared-image cache.
 for(const axis of ['x','y','x']){
  const output=createCanvas(240,80),ctx=output.getContext('2d');ctx.translate(120,40);
  paintTapeStrip(ctx,{width:200,height:40,tapeStrip:{axis,baseWidth:200,baseHeight:40,
   bandWidthScene:20,points:[[.1,.5],[.9,.5]],pathLengthMM:80,
   sourceLengthMM:100,sourcePeriodMM:20}},image,{createCanvas:()=>createCanvas(1,1)});
  const pixel=ctx.getImageData(60,40,1,1).data;
  assert.ok(pixel[1]>100&&pixel[3]>240,`${axis}: tape must paint actual green pixels, not transparent photo padding`);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {rectifiedPixelSize} from '../src/perspective.js';
import {fittedSize,resampleMask,scaleFramePlacement} from '../src/cutout-edit-resolution.js';
import {fullResolutionPlacement} from '../src/cutout-full-resolution.js';
import {imageTier} from '../src/image-variants.js';
import {candidateCropBounds,cropBitmap} from '../src/image.js';
import {createCanvas,loadImage} from 'canvas';

test('A4 correction never exceeds the longest-edge 4096px limit',()=>{
 const a=rectifiedPixelSize(3024,4032,4096,210/297);
 assert.ok(a.height<=4096&&a.width<=4096);
 assert.equal(a.height,4032);
 const b=rectifiedPixelSize(6000,8000,4096,210/297);
 assert.equal(b.height,4096);
 assert.equal(b.width,Math.round(4096*210/297));
 const landscape=rectifiedPixelSize(8000,6000,4096,297/210);
 assert.equal(landscape.width,4096);
 assert.ok(landscape.height<=4096);
});

test('900px segmentation preview gets at most 900px local edit image (960px COS network tier)',()=>{
 assert.equal(imageTier(900),960);
 assert.deepEqual(fittedSize(3200,2400,900),{width:900,height:675});
 assert.deepEqual(fittedSize(1920,1080,1200),{width:1200,height:675});
 assert.deepEqual(fittedSize(4000,3000,1600),{width:1600,height:1200});
});

test('candidate placement roundtrips through preview and saved high-resolution frame',()=>{
 const orig={x:250,y:180,width:1100,height:870,frameWidth:2400,frameHeight:2000};
 const preview=scaleFramePlacement(orig,2400,2000,900,750);
 assert.equal(preview.width,412.5);
 assert.equal(preview.height,326.25);
 const replay=fullResolutionPlacement({candidateFramePlacement:orig},2400,2000);
 assert.deepEqual(replay,orig);
 const changedScale=fullResolutionPlacement({candidateFramePlacement:orig},4800,4000);
 assert.equal(changedScale.x,500);
 assert.equal(changedScale.y,360);
 assert.equal(changedScale.width,2200);
 assert.equal(changedScale.height,1740);
});

test('small edited alpha scales without emitting new high-resolution mask',()=>{
 const source={width:2,height:2,alpha:new Uint8ClampedArray([0,128,128,255])};
 const resized=resampleMask(source,4,4);
 assert.equal(resized.width,4);
 assert.equal(resized.height,4);
 assert.equal(resized.alpha.length,16);
 assert.equal(resized.alpha[0],0);
 assert.equal(resized.alpha[15],255);
 assert.ok(resized.alpha.every(a=>a>=0&&a<=255));
});

test('SAM candidate crop uses matching high-resolution endpoints',()=>{
 const region={x:313/1024,y:217/724,w:126/1024,h:81/724};
 const bounds=candidateCropBounds(4032,2851,{x:0,y:0,w:1,h:1},region);
 assert.equal(bounds.x,Math.round(4032*313/1024));
 assert.equal(bounds.x+bounds.w,Math.round(4032*439/1024));
 assert.equal(bounds.y+bounds.h,Math.round(2851*298/724));
 assert.equal(bounds.w,497);
});

test('SAM export does not soften its low-resolution mask before projection',async()=>{
 const before=globalThis.document;
 globalThis.document={createElement:()=>{
   const canvas=createCanvas(1,1);
   canvas.toBlob=callback=>callback(new Blob([canvas.toBuffer('image/png')],{type:'image/png'}));
   return canvas;
 }};
 try{
   const source=createCanvas(8,8);
   source.getContext('2d').fillRect(0,0,8,8);
   const mask={width:1,height:1,alpha:new Uint8Array([255]),topologyPreserved:true};
   const result=await cropBitmap(source,{x:0,y:0,w:1,h:1},
     {x:0,y:0,w:1,h:1,segmentationMethod:'sam2-small',mask});
   const decoded=await loadImage(Buffer.from(await result.arrayBuffer()));
   const target=createCanvas(8,8),ctx=target.getContext('2d');ctx.drawImage(decoded,0,0);
   const rgba=ctx.getImageData(0,0,8,8).data;
   assert.equal(rgba[(4*8+4)*4+3],255);
   assert.equal(mask.alpha[0],255);
 }finally{globalThis.document=before;}
});

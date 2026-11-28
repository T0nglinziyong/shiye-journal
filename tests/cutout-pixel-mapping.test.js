import test from 'node:test';
import assert from 'node:assert/strict';
import {rectifiedPixelSize} from '../src/perspective.js';
import {fittedSize,resampleMask,scaleFramePlacement} from '../src/cutout-edit-resolution.js';
import {fullResolutionPlacement,renderHighResolutionCutout} from '../src/cutout-full-resolution.js';
import {encodeAlphaMask} from '../src/alpha-mask-blob.js';
import {imageTier} from '../src/image-variants.js';
import {candidateCropBounds,cropBitmap,outputMaskBlurPx,sharpenExportAlpha,initialMaterialRotation,
 polishProjectedMask,enclosedMaskHoles} from '../src/image.js';
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

test('text direction wins, image direction follows, and uncertain results use geometry',()=>{
 assert.equal(initialMaterialRotation({segmentationMethod:'fastsam-sam2-small',
   orientationProposal:{source:'ocr',degrees:-90,confidence:.94}}),-90);
 assert.equal(initialMaterialRotation({segmentationMethod:'sam2-small',
   orientationProposal:{source:'rightwayup',degrees:12,confidence:.75}}),12);
 assert.equal(initialMaterialRotation({segmentationMethod:'sam2-small',
   orientationProposal:{source:'rightwayup',degrees:12,confidence:.3}}),null);
 assert.equal(initialMaterialRotation({segmentationMethod:'sam2-small'}),null);
 assert.equal(initialMaterialRotation({segmentationMethod:'physical'}),null);
 assert.equal(initialMaterialRotation({segmentationMethod:'sam2-small',
   orientedBox:{autoDeskew:true,rotation:17}}),-17);
});

test('export automatically antialiases model masks without changing stored mask',()=>{
 const mask={width:250,height:100,alpha:new Uint8Array(25000)};
 const region={segmentationMethod:'sam2-small',mask};
 const automatic=outputMaskBlurPx(region,1000,400);
 const regularized=outputMaskBlurPx({...region,maskAntialias:true},1000,400);
 assert.ok(automatic>2&&automatic<=3);
 assert.ok(regularized>automatic&&regularized<=3.5);
 assert.equal(outputMaskBlurPx({...region,segmentationMethod:'browser-morphgac'},1000,400),.45);
 assert.equal(outputMaskBlurPx(region,250,100),.72);
 assert.equal(sharpenExportAlpha(0),0);
 assert.ok(Math.abs(sharpenExportAlpha(128)-128)<=3);
 assert.equal(sharpenExportAlpha(255),255);
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

test('export edge polish rounds a model stair while retaining an enclosed transparent hole',()=>{
 const mask={width:8,height:8,alpha:new Uint8Array(64).fill(255)};
 mask.alpha[3*8+3]=0;
 const holes=enclosedMaskHoles(mask);
 assert.equal(holes[3*8+3],1);
 const width=32,height=32,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   data[(y*width+x)*4+3]=x>=12&&x<16&&y>=12&&y<16?0:x<16+Math.floor(y/4)?255:0;
 }
 const before=new Uint8ClampedArray(data);
 polishProjectedMask({data},width,height,3,mask);
 assert.equal(data[(14*width+14)*4+3],0);
 assert.ok(data.some((value,index)=>index%4===3&&value>0&&value<255));
 assert.equal(mask.alpha[3*8+3],0);
 assert.ok(before.some((value,index)=>index%4===3&&value===255));
});

test('edited model mask uses the same antialiased high-resolution projection',async()=>{
 const previous={document:globalThis.document,createImageBitmap:globalThis.createImageBitmap};
 globalThis.document={createElement:()=>{
   const canvas=createCanvas(1,1);
   canvas.toBlob=callback=>callback(new Blob([canvas.toBuffer('image/png')],{type:'image/png'}));
   return canvas;
 }};
 globalThis.createImageBitmap=async blob=>loadImage(Buffer.from(await blob.arrayBuffer()));
 try{
   const source=createCanvas(64,64),ctx=source.getContext('2d');
   ctx.fillStyle='#2277bb';ctx.fillRect(0,0,64,64);
   const alpha=new Uint8Array(16*16);
   for(let y=2;y<14;y++)for(let x=2;x<12+Math.floor(y/4);x++)alpha[y*16+x]=255;
   for(let y=7;y<=9;y++)for(let x=7;x<=9;x++)alpha[y*16+x]=0;
   const result=await renderHighResolutionCutout(
     new Blob([source.toBuffer('image/png')],{type:'image/png'}),
     encodeAlphaMask(alpha,16,16),{segmentationMethod:'sam2-small'});
   const decoded=await loadImage(Buffer.from(await result.arrayBuffer()));
   const output=createCanvas(64,64),target=output.getContext('2d');
   target.drawImage(decoded,0,0);
   const bytes=target.getImageData(0,0,64,64).data;
   assert.ok(bytes.some((value,index)=>index%4===3&&value>0&&value<255));
   assert.equal(bytes[(34*64+34)*4+3],0);
   assert.equal(bytes[(20*64+20)*4+3],255);
 }finally{
   for(const [key,value] of Object.entries(previous)){
     if(value===undefined)delete globalThis[key];else globalThis[key]=value;
   }
 }
});

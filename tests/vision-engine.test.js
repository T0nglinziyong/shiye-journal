import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';
test('almost rectangular paper repairs a small bitten edge without a jagged contour',async()=>{
  const cv=await cvModule,width=120,height=160,alpha=new Uint8Array(width*height);
  for(let y=20;y<140;y++)for(let x=20;x<100;x++)alpha[y*width+x]=255;
  for(let y=110;y<122;y++)for(let x=20;x<26;x++)alpha[y*width+x]=0;
  const r=await processVision(cv,'material-mask',{alpha,width,height});assert.equal(r.edgeMethod,'slimsam-rectangular-prior');assert.equal(r.mask.polygons[0].length,4);
  assert.equal(r.mask.alpha[(115-Math.round(r.y*height))*r.mask.width+22-Math.round(r.x*width)],255);
});
test('model contour fills printed white holes but preserves a concave material boundary',async()=>{
  const cv=await cvModule,width=100,height=100,alpha=new Uint8Array(width*height);
  for(let y=20;y<80;y++)for(let x=20;x<80;x++)if(!(x>55&&y>55))alpha[y*width+x]=255;
  for(let y=30;y<40;y++)for(let x=30;x<40;x++)alpha[y*width+x]=0;
  const r=await processVision(cv,'material-mask',{alpha,width,height}),left=Math.round(r.x*width),top=Math.round(r.y*height),at=(x,y)=>r.mask.alpha[(y-top)*r.mask.width+x-left];
  assert.equal(at(35,35),255);assert.equal(at(70,70),0);assert.equal(at(0+left,0+top),0);
});
test('GrabCut removes an attached neutral shadow without clipping coloured paper',async()=>{
  const cv=await cvModule,width=160,height=180,pixels=new Uint8ClampedArray(width*height*4),mask=new Uint8Array(width*height),evidence=new Uint8Array(width*height),foregroundSeeds=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,p=i*4,paper=x>=40&&x<110&&y>=40&&y<140,shadow=x>=40&&x<125&&y>=40&&y<150;
    pixels.set(paper?[60,140,210,255]:shadow?[205,205,205,255]:[245,245,245,255],p);
    mask[i]=shadow?1:0;evidence[i]=foregroundSeeds[i]=paper?1:0;
  }
  const before=pixels.slice(),result=await processVision(cv,'components',{mask,evidence,foregroundSeeds,pixels,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});
  assert.equal(result.length,1);const r=result[0],a=r.mask,at=(x,y)=>a.alpha[(y-Math.round(r.y*height))*a.width+x-Math.round(r.x*width)];
  assert.equal(at(70,80),255);assert.equal(at(118,80),0);assert.equal(at(70,146),0);assert.deepEqual(pixels,before);
  assert.ok(a.polygons[0].length<=8,'straight paper must not have a staircase contour');
});
test('OpenCV contours preserve candidate bounds, fill printed detail and reject page-sized components',async()=>{
  const cv=await cvModule,width=100,height=150,mask=new Uint8Array(width*height);for(let y=30;y<110;y++)for(let x=20;x<65;x++)mask[y*width+x]=1;for(let y=45;y<60;y++)for(let x=30;x<40;x++)mask[y*width+x]=0;
  const result=await processVision(cv,'components',{mask,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});assert.equal(result.length,1);assert.equal(result[0].mask.width,51);assert.equal(result[0].mask.height,86);assert.equal(result[0].mask.alpha[25*51+15],255);assert.equal(result[0].mask.alpha[0],0);
  const empty=await processVision(cv,'components',{mask:new Uint8Array(width*height).fill(1),width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});assert.deepEqual(empty,[]);
});
test('OpenCV local light balance is effective without changing source or alpha',async()=>{
  const cv=await cvModule,width=80,height=80,pixels=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=40+x*2;pixels[i+3]=x%2?128:255;}const original=pixels.slice(),out=await processVision(cv,'balance',{pixels,width,height});assert.deepEqual(pixels,original);assert.ok(out.pixels.some((v,i)=>i%4!==3&&v!==pixels[i]));for(let i=3;i<pixels.length;i+=4)assert.equal(out.pixels[i],pixels[i]);
});
test('OpenCV detects actual paper corners and refuses a featureless full photograph',async()=>{
  const cv=await cvModule,width=180,height=240,pixels=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,value=x>=20&&x<=160&&y>=20&&y<=220?240:60;pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;}const corners=await processVision(cv,'quad',{pixels,width,height,paperRatio:140/200});assert.equal(corners.length,4);assert.ok(Math.abs(corners[0].x-20/180)<.01);assert.ok(Math.abs(corners[2].y-220/240)<.01);assert.equal(await processVision(cv,'quad',{pixels:new Uint8ClampedArray(width*height*4).fill(255),width,height,paperRatio:140/200}),null);
});
test('shadow-only components are excluded while a colored object remains intact',async()=>{
 const cv=await cvModule,width=100,height=150,mask=new Uint8Array(width*height),evidence=new Uint8Array(width*height);
 for(let y=20;y<55;y++)for(let x=10;x<30;x++)mask[y*width+x]=1;
 for(let y=70;y<120;y++)for(let x=50;x<80;x++)mask[y*width+x]=evidence[y*width+x]=1;
 const result=await processVision(cv,'components',{mask,evidence,width,height,smallestMM:6,paperWidthMM:210,paperHeightMM:297});assert.equal(result.length,1);assert.ok(result[0].y>.4);
});

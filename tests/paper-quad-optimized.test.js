import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {readFile} from 'node:fs/promises';
import {processVision} from '../src/opencv-worker.js';
import {A4_DETECTION_MAX_EDGE,A4_GROUP_LIMIT,A4_CANNY_BLURS,
 A4_POLYGON_EPSILONS,A4_REGION_OVERLAP,orderPaperCorners,paperPolygonIoU,edgeEvidence
} from '../src/paper-quad-optimized.js';

test('one fixed 800px detection stage; no return to 400/1200 cascade',async()=>{
 assert.equal(A4_DETECTION_MAX_EDGE,800);
 assert.deepEqual(A4_CANNY_BLURS,[3,5]);
 assert.deepEqual(A4_POLYGON_EPSILONS,[.014,.02,.03,.05]);
 assert.equal(A4_GROUP_LIMIT,8);
 assert.equal(A4_REGION_OVERLAP,.65);
 const perspective=await readFile(new URL('../src/perspective.js',import.meta.url),'utf8');
 const worker=await readFile(new URL('../src/opencv-worker.js',import.meta.url),'utf8');
 assert.match(perspective,/Math\.min\(1,800\/Math\.max\(bitmap.width,bitmap.height\)\)/);
 assert.match(worker,/if\(operation==='quad'\)return detectPaperQuadOptimized\(cv,p,own\)/);
 assert.doesNotMatch(worker,/fallbackPaperQuad400|rescuePaperQuadCanny3|detectPaperQuadMultiScale/);
 assert.match(worker,/if\(operation==='process-material-boxes'\)/);
 assert.match(worker,/if\(operation==='warp'\)/);
});
const rectangle=[[.12,.12],[.87,.12],[.87,.88],[.12,.88]].map(([x,y])=>({x,y}));
test('normalized corners have correct clockwise order and area IoU',()=>{
 assert.deepEqual(orderPaperCorners(rectangle.slice().reverse()),rectangle);
 assert.ok(Math.abs(paperPolygonIoU(rectangle,rectangle)-1)<1e-7);
 assert.ok(paperPolygonIoU(rectangle,rectangle.map(({x,y})=>({x:x+.06,y})))<1);
 assert.equal(paperPolygonIoU(rectangle,[]),0);
});
function pagePixels(width,height,blank=false){
 const pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const paper=!blank&&x>=Math.round(width*.12)&&x<=Math.round(width*.88)&&
     y>=Math.round(height*.10)&&y<=Math.round(height*.90);
   const i=(y*width+x)*4,value=paper?236:52;
   pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;
 }
 return pixels;
}
test('same worker finds the paper at a single 800px source resolution',async()=>{
 const cv=await cvModule,w=800,h=600,pixels=pagePixels(w,h);
 const corners=await processVision(cv,'quad',{pixels,width:w,height:h,paperRatio:210/297});
 assert.equal(corners?.length,4,'expected A4 outer boundary');
 assert.ok(Math.abs(corners[0].x-.12)<.03);
 assert.ok(Math.abs(corners[0].y-.10)<.03);
 assert.ok(Math.abs(corners[2].x-.88)<.03);
 assert.ok(Math.abs(corners[2].y-.90)<.03);
});
test('blank page frame does not get invented as a document',async()=>{
 const cv=await cvModule,w=800,h=600;
 assert.equal(await processVision(cv,'quad',{
  pixels:pagePixels(w,h,true),width:w,height:h,paperRatio:210/297
 }),null);
});
test('paper candidate with edges crossing the interior is rejected',async()=>{
 const cv=await cvModule,w=800,h=600,pixels=pagePixels(w,h);
 const src=cv.matFromArray(h,w,cv.CV_8UC4,pixels),gray=new cv.Mat(),gx=new cv.Mat(),gy=new cv.Mat();
 try{
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
  cv.Sobel(gray,gx,cv.CV_32F,1,0,3);
  cv.Sobel(gray,gy,cv.CV_32F,0,1,3);
  const candidate=points=>({corners:points.map(([x,y])=>({x,y}))});
  const outer=candidate([[.12,.10],[.88,.10],[.88,.90],[.12,.90]]);
  const clipped=candidate([[.12,.28],[.88,.10],[.88,.75],[.12,.75]]);
  assert.ok(edgeEvidence(outer,w,h,gray.data,gx.data32F,gy.data32F)>.5);
  assert.equal(edgeEvidence(clipped,w,h,gray.data,gx.data32F,gy.data32F),null);
 }finally{src.delete();gray.delete();gx.delete();gy.delete();}
});
test('printed fragments inside a page cannot borrow evidence from its distant border',async()=>{
 const cv=await cvModule,w=800,h=600,gray=new cv.Mat(h,w,cv.CV_8UC1),gx=new cv.Mat(),gy=new cv.Mat();
 try{
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   let value=x>=130&&x<670&&y>=120&&y<540?230:30;
   if(y>=500&&y<515&&x>=130&&x<670&&Math.floor((x-130)/55)%5===0)value=180;
   gray.data[y*w+x]=value;
  }
  cv.Sobel(gray,gx,cv.CV_32F,1,0,3);
  cv.Sobel(gray,gy,cv.CV_32F,0,1,3);
  const candidate=bottom=>({corners:[[130,120],[670,120],[670,bottom],[130,bottom]]
   .map(([x,y])=>({x:x/w,y:y/h}))});
  assert.equal(edgeEvidence(candidate(500),w,h,gray.data,gx.data32F,gy.data32F),null);
  assert.ok(edgeEvidence(candidate(540),w,h,gray.data,gx.data32F,gy.data32F)>.5);
 }finally{gray.delete();gx.delete();gy.delete();}
});
test('candidate scoring reuses Sobel and limits expensive region refinement',async()=>{
 const source=await readFile(new URL('../src/paper-quad-optimized.js',import.meta.url),'utf8');
 assert.equal((source.match(/cv\.Sobel\(gray/g)||[]).length,2);
 assert.match(source,/groups\.slice\(0,A4_GROUP_LIMIT\)/);
 assert.match(source,/firstHull&&strongestClosed<\.60/);
 assert.doesNotMatch(source,/colorSpaceConversion|equalizeHist|createWorker/);
});

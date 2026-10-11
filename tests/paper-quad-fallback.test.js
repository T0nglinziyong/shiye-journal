import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {readFile} from 'node:fs/promises';
import {PAPER_FALLBACK_MAX_EDGE,PAPER_FALLBACK_THRESHOLDS,
  PAPER_FALLBACK_EPSILONS,PAPER_FALLBACK_MIN_SCORE,
  fallbackPaperQuad400,rescuePaperQuadCanny3} from '../src/paper-quad-fallback.js';

function syntheticPage(){
 const width=800,height=600,pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const index=(y*width+x)*4,white=x>=170&&x<=630&&y>=34&&y<=565;
   pixels[index]=pixels[index+1]=pixels[index+2]=white?241:45;
   pixels[index+3]=255;
 }
 return {pixels,width,height,paperRatio:210/297};
}
function isolatedFallback(cv,p){
 const resources=[],own=mat=>(resources.push(mat),mat);
 try{return fallbackPaperQuad400(cv,p,own);}
 finally{for(const mat of resources.reverse())mat.delete();}
}
test('never allocate 1200px or a new full-size material analysis worker',()=>{
 assert.equal(PAPER_FALLBACK_MAX_EDGE,400);
 assert.deepEqual(PAPER_FALLBACK_THRESHOLDS,[165,180,'edges','edges-low','lab-130']);
 assert.deepEqual(PAPER_FALLBACK_EPSILONS,[.012,.02,.032]);
 assert.ok(PAPER_FALLBACK_MIN_SCORE>=.6);
});
test('OpenCV 400px fallback identifies a simple large A4-like sheet',async()=>{
 const cv=await cvModule,quad=isolatedFallback(cv,syntheticPage());
 assert.equal(quad?.length,4);
 assert.ok(Math.abs(quad[0].x-.2125)<.035);
 assert.ok(Math.abs(quad[0].y-.0567)<.035);
 assert.ok(Math.abs(quad[2].x-.7875)<.035);
 assert.ok(Math.abs(quad[2].y-.9417)<.035);
});
test('blank images do not become paper just because the threshold was relaxed',async()=>{
 const cv=await cvModule,{width,height,paperRatio}=syntheticPage(),
   pixels=new Uint8ClampedArray(width*height*4).fill(255);
 assert.equal(isolatedFallback(cv,{pixels,width,height,paperRatio}),null);
});
test('800px c9 finder runs unchanged before the optional 400px fallback',async()=>{
 const [worker,perspective]=await Promise.all(['opencv-worker.js','perspective.js'].map(
   file=>readFile(new URL('../src/'+file,import.meta.url),'utf8')));
 assert.match(worker,/for\(const threshold of \[150,165,180,195,210,'otsu','edges','edges-low','lab-125','lab-130'\]/);
 assert.match(worker,/best\?\.corners\|\|rescuePaperQuadCanny3\(cv,p,own\)\|\|fallbackPaperQuad400\(cv,p,own\)/);
 assert.doesNotMatch(worker,/detectPaperQuadMultiScale/);
 assert.match(perspective,/Math\.min\(1,800\/Math\.max\(bitmap.width,bitmap.height\)\)/);
 assert.doesNotMatch(perspective,/1200\/Math\.max/);
});

test('3px Canny rescue respects original c9 quad geometry and rejects blank input',async()=>{
 const cv=await cvModule;
 const source=syntheticPage();
 const resources=[],own=mat=>(resources.push(mat),mat);
 try{
   const corners=rescuePaperQuadCanny3(cv,source,own);
   assert.equal(corners?.length,4);
 }finally{for(const mat of resources.reverse())mat.delete();}
 const blank=new Uint8ClampedArray(source.pixels.length).fill(255);
 const other=[],alloc=mat=>(other.push(mat),mat);
 try{
   assert.equal(rescuePaperQuadCanny3(cv,{...source,pixels:blank},alloc),null);
 }finally{for(const mat of other.reverse())mat.delete();}
});
test('c9 primary contour code runs before both conditional rescue stages',async()=>{
 const worker=await readFile(new URL('../src/opencv-worker.js',import.meta.url),'utf8');
 const start=worker.indexOf("if(operation==='quad')");
 const end=worker.indexOf("if(operation==='alignment')",start);
 const section=worker.slice(start,end);
 assert.match(section,/for\(const threshold of \[150,165,180,195,210/);
 assert.match(section,/return best\?\.corners\|\|rescuePaperQuadCanny3\(cv,p,own\)\|\|fallbackPaperQuad400\(cv,p,own\)/);
 assert.equal((section.match(/rescuePaperQuadCanny3\(/g)||[]).length,1);
});

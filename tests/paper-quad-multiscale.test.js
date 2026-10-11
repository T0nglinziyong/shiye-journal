import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PAPER_QUAD_SCALES,PAPER_QUAD_THRESHOLDS,PAPER_QUAD_EPSILONS,
  paperQuadAgreement,selectPaperQuad} from '../src/paper-quad-multiscale.js';

const quad=(scale,score=.8,dx=0,dy=0)=>({
 scale,score,corners:[
  {x:.13+dx,y:.15+dy},{x:.85+dx,y:.16+dy},
  {x:.89+dx,y:.85+dy},{x:.10+dx,y:.84+dy}
 ]});
test('three physical analysis scales use a single 1200px original and no ML',()=>{
 assert.deepEqual(PAPER_QUAD_SCALES,[400,800,1200]);
 assert.equal(PAPER_QUAD_THRESHOLDS.length,5);
 assert.deepEqual(PAPER_QUAD_EPSILONS,[.012,.02,.032]);
});
test('independent matching scales vote for one quadrilateral',()=>{
 const a=quad(400,.71),b=quad(800,.91,.007,-.003),c=quad(1200,.88,-.005,.002);
 const result=selectPaperQuad([a,b,c]);
 assert.deepEqual(result.scales,[400,800,1200]);
 assert.equal(result.votes,3);
 assert.ok(Math.abs(result.corners[0].x-.13)<.01);
});
test('multiple thresholds within a single scale do not fake consensus',()=>{
 const a=quad(800,.9),b=quad(800,.88,.002,.002),c=quad(800,.87,-.002,0);
 const result=selectPaperQuad([a,b,c]);
 assert.equal(result.votes,1);assert.deepEqual(result.scales,[800]);
});
test('accept a strong single-scale paper when no other resolution produces four corners',()=>{
 const result=selectPaperQuad([quad(800,.94)]);
 assert.equal(result.votes,1);assert.deepEqual(result.scales,[800]);
});
test('keep weak single proposals out, but prefer agreement over high-score singleton',()=>{
 assert.equal(selectPaperQuad([quad(400,.51)]),null);
 const singleton=quad(1200,.99,.22,.05),
  pair1=quad(400,.67),pair2=quad(800,.7,.006,.007);
 const chosen=selectPaperQuad([singleton,pair1,pair2]);
 assert.deepEqual(chosen.scales,[400,800]);
});
test('different paper positions are not clustered together',()=>{
 assert.equal(paperQuadAgreement(quad(400,.8),quad(800,.9,.15,.1)),false);
 assert.equal(paperQuadAgreement(quad(400,.8),quad(800,.9,.006,.007)),true);
});
test('paper-only change never touches material identification or import UI',async()=>{
 const worker=await readFile(new URL('../src/opencv-worker.js',import.meta.url),'utf8');
 const perspective=await readFile(new URL('../src/perspective.js',import.meta.url),'utf8');
 assert.match(worker,/if\(operation==='quad'\)return detectPaperQuadMultiScale\(cv,p,own\)/);
 assert.match(worker,/if\(operation==='process-material-boxes'\)/);
 assert.match(worker,/if\(operation==='boxes-simple'\)/);
 assert.match(perspective,/Math\.min\(1,1200\/Math\.max\(bitmap.width,bitmap.height\)\)/);
 assert.match(perspective,/return visionTask\('quad'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {detectWhitePaperQuad} from '../src/white-paper-quad.js';
import {renderImportInspection} from '../src/import-workspace-ui.js';

const source=file=>readFile(new URL('../src/'+file,import.meta.url),'utf8');

test('paper finder reports missing sides, not just null',()=>{
  const w=800,h=600,gray=new Uint8Array(w*h).fill(150),support=new Uint8Array(w*h);
  const details={};
  const quad=detectWhitePaperQuad([],gray,support,w,h,297/210,details);
  assert.equal(quad,null);
  assert.equal(details.stage,undefined);
  assert.equal(details.detector,'white-paper-quad-v1');
  assert.equal(details.failureStage,'missing-side-evidence');
  assert.deepEqual(details.sideCandidates,{top:0,bottom:0,left:0,right:0});
});

test('no A4 and broken OpenCV worker execution produce distinct diagnostics',async()=>{
 const perspective=await source('perspective.js');
 const stripped=perspective.replace(/^import[^\n]+\n/gm,'').replace(/^export /gm,'');
 const setup=visionTask=>new Function('visionTask','analysisPixels','pixelCanvas','sourcePixels',
   stripped+'; return suggestPaperCorners;')(
     visionTask,async(_bitmap,_box,width,height)=>new Uint8ClampedArray(width*height*4),()=>{},()=>{});
 const bitmap={width:1706,height:1279},events=[];
 const none=setup(async()=>({corners:null,diagnostics:{
   stage:'quad',failureStage:'missing-side-evidence',sideCandidates:{top:3,bottom:0,left:1,right:3}}}));
 assert.equal(await none(bitmap,297/210,{onDiagnostic:x=>events.push(x)}),null);
 assert.equal(events[0].failureStage,'missing-side-evidence');
 const fail=setup(async()=>{throw Error('WASM bad Mat allocation')});
 await assert.rejects(()=>fail(bitmap,297/210,{onDiagnostic:x=>events.push(x)}),/WASM bad Mat allocation/);
 assert.equal(events[1].stage,'quad-error');
 assert.match(events[1].message,/WASM bad Mat allocation/);
});

test('detected paper returns same four original corner coordinates',async()=>{
 const src=await source('perspective.js');
 const sourceOnly=src.replace(/^import[^\n]+\n/gm,'').replace(/^export /gm,'');
 const corners=[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.85},{x:.1,y:.85}];
 const received=[];
 const quad=new Function('visionTask','analysisPixels','pixelCanvas','sourcePixels',
   sourceOnly+';return suggestPaperCorners;')(
   async()=>({corners,diagnostics:{stage:'quad',accepted:true,totalSegments:100}}),
   async(_bitmap,_box,width,height)=>new Uint8ClampedArray(width*height*4),()=>{},()=>{});
 assert.deepEqual(await quad({width:1706,height:1279},297/210,{onDiagnostic:x=>received.push(x)}),corners);
 assert.equal(received[0].accepted,true);
});

test('diagnostics are attached for both active/prefetch and available before recognition',async()=>{
 const app=await source('app.js');
 assert.ok(app.includes('paperDiagnostic:rec.paperDiagnostic||null'));
 assert.match(app,/onDiagnostic:diagnostic=>\{if\(isCurrent\(\)\)rec\.paperDiagnostic=diagnostic;\}/);
 assert.match(app,/if\(valid\(\)\)rec\.paperDiagnostic=diagnostic/);
 assert.ok(app.includes('quad-error'));
 const view=await source('import-workspace-ui.js');
 assert.match(view,/纸张检测未通过/);
});

test('paper detector keeps prior material recognition logic, only adds lightweight diagnostic data',async()=>{
 const worker=await source('opencv-worker.js');
 assert.match(worker,/cv\.HoughLinesP\(edges,segments,1,Math\.PI\/180,35/);
 assert.match(worker,/return p\.collectDiagnostics\?\{corners,diagnostics\}:corners/);
 assert.match(worker,/if\(operation==='boxes-simple'\)return discoverMaterialBoxes/);
});

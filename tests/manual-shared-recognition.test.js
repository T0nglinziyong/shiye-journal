import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  manualBoxGeometry,manualFrameFallbackRegion,segmentManualOrFallback
} from '../src/manual-import-recognition.js';

const geometry=()=>manualBoxGeometry(
  {x:.25,y:.28,w:.24,h:.15,rotation:35},
  {pagePixelWidth:960,pagePixelHeight:720}
);
test('failed contour keeps a rotated user-authored mask, never the full bounding rectangle',async()=>{
  const box=geometry();
  const candidate=await segmentManualOrFallback(box,async()=>{throw Error('no contour');},
    {pagePixelWidth:960,pagePixelHeight:720});
  assert.equal(candidate.manualFallback,true);
  assert.equal(candidate.recognitionFallback,true);
  assert.equal(candidate.segmentationMethod,'manual-frame-fallback');
  assert.equal(candidate.mask.alpha.length,candidate.mask.width*candidate.mask.height);
  assert.ok(candidate.mask.alpha.some(v=>v===255));
  assert.ok(candidate.mask.alpha.some(v=>v===0),'Rotated bbox corners must remain transparent');
  assert.equal(candidate.orientedBox.rotation,35);
});
test('successful automatic contour is returned without modifying its geometry or mask',async()=>{
  const box=geometry();
  const result={...box,mask:{width:2,height:2,alpha:new Uint8Array([255,255,255,255])}};
  const actual=await segmentManualOrFallback(box,async()=>result,{pagePixelWidth:960,pagePixelHeight:720});
  assert.strictEqual(actual,result);
});
test('empty mask follows the same pending-review fallback instead of rejecting the whole edit',async()=>{
  const box=geometry();
  let error=null;
  const actual=await segmentManualOrFallback(box,async()=>({...box,
    mask:{width:1,height:1,alpha:new Uint8Array([0])}}),
    {pagePixelWidth:960,pagePixelHeight:720},reason=>{error=reason;});
  assert.ok(error);
  assert.equal(actual.manualFallback,true);
});
test('manual and automatic boxes share recognition profile, preprocess and extraction',async()=>{
  const [app,worker,recognition]=await Promise.all([
    readFile(new URL('../src/app.js',import.meta.url),'utf8'),
    readFile(new URL('../src/opencv-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../src/image.js',import.meta.url),'utf8')
  ]);
  assert.match(app,/recognitionProfile\([\s\S]*?\.refineCandidates\(\{/);
  assert.match(recognition,/profile\.refineCandidates\(\{/);
  assert.match(app,/candidates:\[box\]/);
  assert.match(app,/preprocess,postprocess:recognitionPostprocessOptions\(\)/);
  assert.match(app,/extractImportCandidate\(source,b,region/);
  assert.match(worker,/if\(operation==='process-material-boxes'\)/);
  assert.doesNotMatch(worker,/p\.manualEdit/);
  assert.doesNotMatch(app,/manualEdit:true/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {refineManualBoxes} from '../src/manual-import-recognition.js';

const src=name=>readFile(new URL('../src/'+name,import.meta.url),'utf8');
const box={x:.1,y:.2,w:.25,h:.18,rotation:0};
const good={...box,mask:{width:2,height:2,alpha:new Uint8Array([255,255,255,255])}};
test('a valid manual box returns a real contour, not a placeholder',async()=>{
  const regions=await refineManualBoxes([box],[],async()=>good);
  assert.equal(regions.length,1);
  assert.equal(regions[0].region,good);
});
test('an edited box with no valid mask is rejected without changing its previous result',async()=>{
  const old={region:good,url:'blob:prior'};
  await assert.rejects(refineManualBoxes([{...box,manualChanged:true,sourceIndex:0}],[old],async()=>null),/分割失败/);
  assert.equal(old.url,'blob:prior');
  assert.equal(old.region,good);
});
test('untouched manual box does not need a second segmentation',async()=>{
  const old={region:good};
  const result=await refineManualBoxes([{...box,sourceIndex:0}],[old],async()=>{throw Error('should not run');});
  assert.equal(result[0].original,old);
});
test('manual worker rejects absent contours before shape or aperture postprocessing',async()=>{
  const code=await src('opencv-worker.js');
  assert.match(code,/if\(p\.manualEdit&&\(!Array\.isArray\(out\)/);
  assert.match(code,/segmentMaterialBoxes\\(/);
  assert.match(code,/if\(p\.shapeRegularization!==false\)/);
  assert.match(code,/if\\(p\\.shapeRegularization!==false\\)/);
  const app=await src('app.js');
  assert.match(app,/recognitionProfile\\(/);
  assert.match(app,/manualAnalysisPromise\|\|=analysisPixels\(source,b,aw,ah\)/);
});
test('automatic recognition applies an 8 mm floor to both sides before individual refinement',async()=>{
  const code=await src('image.js');
  assert.match(code,/const candidates=discovered\.filter/);
  assert.match(code,/widthMM>=8&&heightMM>=8/);
  assert.ok(code.indexOf('const candidates=discovered.filter')<code.indexOf('profile.refineCandidates'));
  assert.match(code,/filteredBelow8MM/);
});

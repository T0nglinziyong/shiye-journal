import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {refineManualBoxes,manualBoxGeometry} from '../src/manual-import-recognition.js';

const region={x:.12,y:.2,w:.16,h:.11,mask:{width:20,height:10,alpha:new Uint8Array(200).fill(255)},
  orientedBox:{centerX:.20,centerY:.255,width:.18,height:.13,rotation:4,autoDeskew:true}};
const old={region,blob:new Blob(['old']),url:'blob:old',width:38,height:22,selected:true};
test('unchanged automatic box reuses original mask even with stale geometrical bounds',async()=>{
  const box={x:-.01,y:.1,w:.19,h:.16,sourceIndex:0,manualChanged:false};
  const plans=await refineManualBoxes([box],[old],async()=>{throw Error('MUST NOT RESEGMENT')});
  assert.equal(plans.length,1);
  assert.strictEqual(plans[0].region,region);
  assert.strictEqual(plans[0].original,old);
  assert.strictEqual(plans[0].region.mask,region.mask);
});
test('changed source and newly added regions share automatic CV box schema',async()=>{
 const seen=[];
 const first={x:.2,y:.3,w:.15,h:.12,rotation:5,manualChanged:true,sourceIndex:0};
 const second={x:.5,y:.5,w:.2,h:.25,rotation:-8};
 const result=await refineManualBoxes([first,second],[old],async box=>{
   seen.push(box);
   return {...box,mask:region.mask};
 });
 assert.equal(result.length,2);
 assert.equal(seen.length,2);
 assert.deepEqual(Object.keys(seen[0]).sort(),Object.keys(seen[1]).sort());
 assert.ok(seen.every(b=>b.orientedBox?.width===b.w&&b.orientedBox?.height===b.h));
 assert.ok(seen.every(b=>Number.isFinite(b.seedDensity)&&Number.isFinite(b.fillRatio)));
});
test('no mask is an explicit error and leaves previous source untouched',async()=>{
 await assert.rejects(()=>refineManualBoxes([{x:.2,y:.2,w:.2,h:.2,manualChanged:true,sourceIndex:0}],[old],async()=>null),/原素材未修改/);
 assert.equal(old.url,'blob:old');
 assert.strictEqual(old.region.mask,region.mask);
});
test('manual editor resets edit marker, skips processing if nothing changed',async()=>{
 const src=await readFile(new URL('../src/import-box-editor.js',import.meta.url),'utf8');
 assert.match(src,/sourceIndex,manualChanged:false/);
 assert.match(src,/if\(unchanged\)\{/);
 assert.match(src,/if\(await refreshImportCandidates\(boxes,\{manual:true\}\)===false\)/);
});
test('manual input uses the normalized automatic box schema in CV call',async()=>{
 const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/boxes:\[box\],method:/);
 assert.match(app,/recognitionProfile\\(/);
 assert.match(app,/manualAnalysisPromise\|\|=analysisPixels/);
});

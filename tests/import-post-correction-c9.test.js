import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {refineManualBoxes,hasManualForegroundEvidence} from '../src/manual-import-recognition.js';
const src=async file=>readFile(new URL('../src/'+file,import.meta.url));
const hashes={
'image.js':'88d244bf813213c40d2baf8b24e7914d9e594882',
'manual-import-recognition.js':'7f843bae5c81fb8f2046ae176ff4b0855446f0b8',
'import-box-editor.js':'05fa34fa0f09ad350db256350113705b0aee8e01',
'recognition-refiners.js':'e4bd77e4e373e6a3d6ea5d28aa08bdba5e8f2652',
'recognition-raster.js':'4e88878477689fa3c973576c5ce51c419145343a',
'material-color-restoration.js':'4be602eab1a8d3d1281ba6c455c1ad80055da1c3'
};
for(const [name,expected] of Object.entries(hashes)){
 test('recognition implementation matches c9: '+name,async()=>{
  const bytes=await src(name);
  const sha=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  assert.equal(sha,expected);
 });
}
test('a newly drawn rotated rectangle reaches the old segmenter unchanged',async()=>{
 const input={x:.3,y:.22,w:.25,h:.16,rotation:45},result={...input,mask:{width:1,height:1,alpha:new Uint8Array([255])}};
 let received=null;
 const plans=await refineManualBoxes([input],[],async box=>{received=box;return result;});
 assert.strictEqual(received,input);
 assert.strictEqual(plans[0].region,result);
});
test('untouched manual frames never rerun segmentation',async()=>{
 const previous=[{region:{mask:{width:1,height:1,alpha:new Uint8Array([255])}},url:'blob:stable'}];
 const plans=await refineManualBoxes([{x:.2,y:.3,w:.3,h:.2,sourceIndex:0,manualChanged:false}],previous,
  async()=>{throw Error('must reuse original');});
 assert.strictEqual(plans[0].original,previous[0]);
});
test('blank crop is rejected before segmentation as in c9',()=>{
 const pixels=new Uint8ClampedArray(64*64*4).fill(240);
 assert.equal(hasManualForegroundEvidence(pixels,64,64,{x:.2,y:.2,w:.2,h:.2}),false);
});
test('paper quad changed but crop and per-box material processing stayed stable',async()=>{
 const [app,worker,image,paper]=await Promise.all(['app.js','opencv-worker.js','image.js','perspective.js'].map(async f=>(await src(f)).toString()));
 assert.match(app,/boxes:\[\{x:box\.x,y:box\.y,w:box\.w,h:box\.h,orientedBox/);
 assert.match(app,/visionTask\('process-material-boxes'/);
 assert.doesNotMatch(app,/segmentManualOrFallback|manualPreparedRasterPromise/);
 assert.match(image,/const candidates=await segmentPaperMaterials\(discoveryFrame/);
 assert.doesNotMatch(image,/filteredBelow8MM|minimumAutoSideMM:8/);
 assert.match(worker,/if\(operation==='process-material-boxes'\)/);
 assert.doesNotMatch(worker,/p\.manualEdit/);
 assert.match(worker,/detectWhitePaperQuad\(/);
 assert.match(paper,/collectDiagnostics:true/);
});

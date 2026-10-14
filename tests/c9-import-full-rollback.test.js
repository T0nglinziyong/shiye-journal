import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const source=name=>readFile(new URL('../src/'+name,import.meta.url));
const expected={
  'manual-import-recognition.js':'7f843bae5c81fb8f2046ae176ff4b0855446f0b8',
  'perspective.js':'1339e08b3b23603d1a41c779792c6a0327c676a8',
  'import-box-editor.js':'196304b571f14f00d02855c6bc08bdb3fd32b533',
  'recognition-raster.js':'4e88878477689fa3c973576c5ce51c419145343a',
  'material-color-restoration.js':'4be602eab1a8d3d1281ba6c455c1ad80055da1c3',
  'import-workspace-ui.js':'8f057fda3ec1c4115b0c8503b5372253c8dc03dc',
  'workflow-ui.js':'87e7ce8603c1dbb699857d00874127454feb1553',
  'styles.css':'c6b7945ba3ffeb4373dbe38f97bc96dbfd9e5178',
  'responsive.css':'3daab9b366125aeda84ed7e78bf2ac72132c8981',
  'paper-ui.js':'43dcd4f457d72382dadd0a0d8cea82cdd248058f',
  'import-save.js':'f3cfd3b556178edabdb55ad8736ca5797f008467',
  'vision-runtime.js':'3817687ab32df7fb19c308c83902a6b123aabee1'
};
for(const [name,sha] of Object.entries(expected)){
  test('c9 recognition core or approved manual UI version: '+name,async()=>{
    const bytes=await source(name);
    const actual=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
    assert.equal(actual,sha);
  });
}
test('research recognizer preserves the explicit classical rollback route',async()=>{
  const [image,paper,refiners,profiles]=await Promise.all([
    'image.js','paper-analysis.js','recognition-refiners.js','recognition-profiles.js'
  ].map(async name=>(await source(name)).toString()));
  assert.match(image,/candidateDiscovery='unified'/);
  assert.match(paper,/candidateDiscovery!=='physical'&&candidateDiscovery!=='unified'/);
  assert.match(paper,/unifyCarrierCandidates\(physical,legacy\)/);
  assert.match(refiners,/candidateDiscovery==='unified'/);
  assert.match(refiners,/method:'morphgac'/);
  assert.match(profiles,/\['legacy','原版/);
  assert.match(profiles,/\['unified','统一候选/);
});
test('import page uses stable automatic paper and manual cutout controls',async()=>{
  const app=(await source('app.js')).toString();
  const page=(await source('import-workspace-ui.js')).toString();
  assert.match(app,/async function switchImportRecord\(index,skipSave=false\)/);
  assert.match(app,/async function previewCorrection\(\)/);
  assert.match(app,/async function applyPaperPreview\(\)/);
  assert.match(app,/async function previewCrop\(\)/);
  assert.match(app,/const plans=manual\?await refineManualBoxes\(regions,previous/);
  assert.match(app,/visionTask\('process-material-boxes'/);
  assert.match(app,/const manualRegion=manualPhysicalRegion\(box,aw,ah\)/);
  assert.match(app,/boxes:\[manualRegion\]/);
  assert.match(app,/if\(!candidate\?\.mask\?\.alpha\?\.length\|\|candidate\.segmentationFailed\)/);
  assert.match(app,/await detectPaperCandidates\(source,b,6/);
  assert.match(app,/async function receiveImportPhotos\(files\)\{const images=\[\.\.\.files\]\.filter\(f=>f\.type\.startsWith\('image\/'\)\)/);
  assert.match(page,/renderImportInspection/);
  assert.match(page,/manual-import-box/);
  assert.match(page,/import-confirm-photo/);
});
test('material recognition stays stable while A4 quad logic may evolve independently',async()=>{
  const app=(await source('app.js')).toString();
  const worker=(await source('opencv-worker.js')).toString();
  assert.doesNotMatch(app,/requiresManualPaperConfirmation|onAnalysisRaster|segmentManualOrFallback|installDesktopImageDrop/);
  assert.doesNotMatch(app,/from '\.\/toast\.js'/);
  assert.doesNotMatch(worker,/detectWhitePaperQuad|HoughLinesP/);
  assert.match(worker,/if\(operation==='quad'\)return detectPaperQuadOptimized\(cv,p,own\)/);
  assert.doesNotMatch(worker,/fallbackPaperQuad400|detectPaperQuadMultiScale/);
  assert.match(worker,/if\(operation==='process-material-boxes'\)/);
  assert.match(app,/setTimeout\(\(\)=>el\.classList\.remove\('show'\),3500\)/);
});

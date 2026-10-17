import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const source=name=>readFile(new URL('../src/'+name,import.meta.url));
const expected={
  'manual-import-recognition.js':'bc83bd2f7e0d572c9fb7c0d3acc724a238385133',
  'perspective.js':'1339e08b3b23603d1a41c779792c6a0327c676a8',
  'material-color-restoration.js':'4be602eab1a8d3d1281ba6c455c1ad80055da1c3',
  // Reviewed change: React owns catalog controls, import queue, candidate controls and review menus;
  // recognition and segmentation code remains unchanged.
  'styles.css':'c6b7945ba3ffeb4373dbe38f97bc96dbfd9e5178',
  'responsive.css':'3daab9b366125aeda84ed7e78bf2ac72132c8981',
  // Reviewed change: editable work keeps candidate frames without the redundant full photo.
  // Recognition and segmentation are unchanged.
  'import-save.js':'dbd610e10c2a2e8d47a072af38e0fd2d4c1131d5',
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
  assert.match(paper,/if\(candidateDiscovery!=='physical'\)return legacy/);
  assert.match(paper,/visionTask\('boxes-research'/);
  assert.match(refiners,/candidateDiscovery==='unified'/);
  assert.match(refiners,/method:'morphgac'/);
  assert.match(profiles,/\['legacy','原版/);
  assert.match(profiles,/\['unified','统一候选/);
  const raster=(await source('recognition-raster.js')).toString();
  assert.match(raster,/if\(research&&/);
  assert.match(raster,/const image=decode\(bytes,/);
});
test('import page uses stable automatic paper and manual cutout controls',async()=>{
  const app=(await source('app.js')).toString();
  const page=(await source('react-routes.jsx')).toString();
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
  assert.match(page,/export function ImportInspectionPage/);
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

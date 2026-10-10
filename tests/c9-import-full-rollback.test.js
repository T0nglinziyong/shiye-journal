import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const source=name=>readFile(new URL('../src/'+name,import.meta.url));
const expected={
  'image.js':'88d244bf813213c40d2baf8b24e7914d9e594882',
  'manual-import-recognition.js':'7f843bae5c81fb8f2046ae176ff4b0855446f0b8',
  'import-box-editor.js':'05fa34fa0f09ad350db256350113705b0aee8e01',
  'recognition-refiners.js':'e4bd77e4e373e6a3d6ea5d28aa08bdba5e8f2652',
  'recognition-raster.js':'4e88878477689fa3c973576c5ce51c419145343a',
  'material-color-restoration.js':'4be602eab1a8d3d1281ba6c455c1ad80055da1c3',
  'perspective.js':'af21f19bead1d03a58626248dd905e8d81f30e59',
  'opencv-worker.js':'1f46cfe14d22171dd11f72b02e06c37a5bfc3c87',
  'import-workspace-ui.js':'a158cd3b2ea4444ed4a77e2c6c2194774a605796',
  'workflow-ui.js':'088058dd6b4ca2d3f7132bd647f89aedb12bd81a',
  'styles.css':'c6b7945ba3ffeb4373dbe38f97bc96dbfd9e5178',
  'responsive.css':'3daab9b366125aeda84ed7e78bf2ac72132c8981',
  'paper-ui.js':'d1ebb53e61c7753c869850528eb43fe1bc7f062a',
  'import-save.js':'503d252ecfb47a9310f099cb4605c538346198c5',
  'paper-analysis.js':'6c1d0e41dbf6794a2db6b9a09ca48ed8da519d1d',
  'recognition-profiles.js':'86bea3a187c096121e5f551abc851f9f461f8c2d',
  'vision-runtime.js':'0e232cafd76e5278da5a5dd6706214cbbdb9c880'
};
for(const [name,sha] of Object.entries(expected)){
  test('c9 import module is byte-for-byte unchanged: '+name,async()=>{
    const bytes=await source(name);
    const actual=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
    assert.equal(actual,sha);
  });
}
test('import page uses stable automatic paper and manual cutout controls',async()=>{
  const app=(await source('app.js')).toString();
  const page=(await source('import-workspace-ui.js')).toString();
  assert.match(app,/async function switchImportRecord\(index,skipSave=false\)/);
  assert.match(app,/async function previewCorrection\(\)/);
  assert.match(app,/async function applyPaperPreview\(\)/);
  assert.match(app,/async function previewCrop\(\)/);
  assert.match(app,/const plans=manual\?await refineManualBoxes\(regions,previous/);
  assert.match(app,/visionTask\('process-material-boxes'/);
  assert.match(app,/boxes:\[\{x:box\.x,y:box\.y,w:box\.w,h:box\.h,orientedBox/);
  assert.match(app,/await detectPaperCandidates\(source,b,6/);
  assert.match(app,/async function receiveImportPhotos\(files\)\{const images=\[\.\.\.files\]\.filter\(f=>f\.type\.startsWith\('image\/'\)\)/);
  assert.match(page,/renderImportInspection/);
  assert.match(page,/manual-import-box/);
  assert.match(page,/import-confirm-photo/);
});
test('post-c9 recognition and c6 toast changes must not return',async()=>{
  const app=(await source('app.js')).toString();
  const worker=(await source('opencv-worker.js')).toString();
  assert.doesNotMatch(app,/requiresManualPaperConfirmation|onAnalysisRaster|segmentManualOrFallback|installDesktopImageDrop/);
  assert.doesNotMatch(app,/from '\.\/toast\.js'/);
  assert.doesNotMatch(worker,/detectWhitePaperQuad|HoughLinesP/);
  assert.match(worker,/for\(const threshold of \[150,165,180/);
  assert.match(app,/setTimeout\(\(\)=>el\.classList\.remove\('show'\),3500\)/);
});

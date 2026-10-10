import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizePreferences,migrateStoredPreferences} from '../src/preferences.js';
import {recognitionProfile} from '../src/recognition-profiles.js';

const source=path=>readFile(new URL('../src/'+path,import.meta.url),'utf8');

test('October 10 pre-PR88 default uses current A4 box discovery and 900px profile',async()=>{
  const [image,paper,worker]=await Promise.all([
    source('image.js'),source('paper-analysis.js'),source('opencv-worker.js')
  ]);
  assert.equal(normalizePreferences({}).recognition,'auto');
  assert.equal(normalizePreferences({}).recognitionPixels,900);
  assert.equal(recognitionProfile('auto',900).mode,'auto');
  assert.match(image,/segmentPaperMaterials\(discoveryFrame/);
  assert.match(paper,/visionTask\('boxes-simple'/);
  assert.match(worker,/operation==='boxes-simple'/);
  assert.doesNotMatch(image,/stablePaperMaterials|recognition-empty-fallback/);
  assert.doesNotMatch(worker,/stable-recognition\/opencv-worker/);
  assert.doesNotMatch(image,/chromatic-fallback|restored-stable-pipeline/);
});

test('PR88 version 3 recognition defaults migrate back to earlier October 10 preferences',()=>{
  const prior={recognitionDefaultsVersion:3,recognition:'auto',
    recognitionPixels:1200,balanceLight:false,paperSize:'letter'};
  const migrated=migrateStoredPreferences(prior);
  assert.equal(migrated.recognitionDefaultsVersion,2);
  assert.equal(migrated.recognition,'auto');
  assert.equal(migrated.recognitionPixels,900);
  assert.equal(migrated.paperSize,'letter','leave unrelated paper preferences alone');
});

test('verified ca0f candidate UI uses the same discovered regions and URLs',async()=>{
  const [view,app]=await Promise.all([source('import-workspace-ui.js'),source('app.js')]);
  assert.match(view,/const visibleCandidates=state\.importProcessing\?\[\]:state\.importCandidates\|\|\[\]/);
  assert.match(app,/const candidates=await detectPaperCandidates\(source,box,6/);
  assert.match(app,/await refreshImportCandidates\(regions/);
  assert.match(app,/case 'manual-import-box':await openManualImportBox\(\)/);
  assert.doesNotMatch(app,/detectImportRegions\(|fixedWorkingSize:true|importPhotoDisplayURL\(/);
});

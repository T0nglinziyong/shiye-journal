import test from 'node:test';
import assert from 'node:assert/strict';
import {recognitionProfile,recognitionPixelOptions,recognitionOptions,candidateDiscoveryOptions,candidateDiscoveryAllowed} from '../src/recognition-profiles.js';
import {normalizePreferences,migrateStoredPreferences} from '../src/preferences.js';

test('validated recognition modes and defaults match the final automatic pipeline',()=>{
  const auto=recognitionProfile('auto',1600);
  assert.equal(auto.analysisMaxDimension,1600,'manual resolution selection must remain effective');
  assert.equal(typeof auto.refineCandidates,'function');

  const morph=recognitionProfile('morphgac',1200);
  assert.equal(morph.analysisMaxDimension,1200,'explicit MorphGAC must respect the selected analysis size');
  assert.equal(typeof morph.refineCandidates,'function');

  assert.equal(recognitionProfile('grabcut',1600).analysisMaxDimension,1600);
  assert.equal(typeof recognitionProfile('grabcut',1600).refineCandidates,'function');
  assert.equal(recognitionProfile('hybrid',1200).analysisMaxDimension,1200);
  assert.equal(typeof recognitionProfile('hybrid',1200).refineCandidates,'function');
  assert.deepEqual(recognitionPixelOptions.map(([value])=>value),[900,1200,1600]);
  assert.deepEqual(recognitionOptions.map(([id])=>id),['auto','morphgac','physical','grabcut','hybrid']);
  assert.deepEqual(candidateDiscoveryOptions.map(([id])=>id),['legacy','physical','unified']);
  assert.equal(candidateDiscoveryAllowed('physical'),true);
  assert.equal(candidateDiscoveryAllowed('random'),false);
  assert.equal(typeof recognitionProfile('physical').refineCandidates,'function');

  const defaults=normalizePreferences({});
  assert.equal(defaults.recognition,'auto');
  assert.equal(defaults.candidateDiscovery,'unified');
  assert.equal(defaults.recognitionPixels,900);
  assert.equal(defaults.balanceLight,false);
  assert.equal(defaults.recognitionDenoise,false);
  assert.equal(defaults.recognitionLocalContrast,false);
  assert.equal(defaults.recognitionChromaEdges,true);
  assert.equal(defaults.recognitionShapeRegularization,true);
  assert.equal(defaults.recognitionApertures,true);

  const custom=normalizePreferences({
    recognition:'grabcut',candidateDiscovery:'physical',recognitionPixels:1600,balanceLight:true,
    recognitionDenoise:true,recognitionLocalContrast:true,
    recognitionChromaEdges:false,recognitionShapeRegularization:false,
    recognitionApertures:false
  });
  assert.equal(custom.recognition,'grabcut');
  assert.equal(custom.candidateDiscovery,'physical');
  assert.equal(custom.recognitionPixels,1600);
  assert.equal(custom.balanceLight,true);
  assert.equal(custom.recognitionDenoise,true);
  assert.equal(custom.recognitionLocalContrast,true);
  assert.equal(custom.recognitionChromaEdges,false);
  assert.equal(custom.recognitionShapeRegularization,false);
  assert.equal(custom.recognitionApertures,false);

  assert.equal(normalizePreferences({recognition:'traditional'}).recognition,'grabcut');
  assert.equal(normalizePreferences({recognition:'active'}).recognition,'morphgac');
  assert.equal(normalizePreferences({recognition:'slimsam'}).recognition,'auto');

  const migrated=migrateStoredPreferences({
    paperSize:'letter',recognition:'grabcut',recognitionPixels:1200,
    balanceLight:true,recognitionDenoise:true,recognitionLocalContrast:true,recognitionChromaEdges:false,
    recognitionShapeRegularization:false,recognitionApertures:false
  });
  assert.equal(migrated.paperSize,'letter','unrelated preferences must survive migration');
  assert.equal(migrated.recognition,'auto');assert.equal(migrated.recognitionPixels,900);
  assert.equal(migrated.balanceLight,false);assert.equal(migrated.recognitionDenoise,false);assert.equal(migrated.recognitionLocalContrast,false);
  assert.equal(migrated.recognitionChromaEdges,true);assert.equal(migrated.recognitionShapeRegularization,true);assert.equal(migrated.recognitionApertures,true);

  const preserved=migrateStoredPreferences({
    recognitionDefaultsVersion:2,recognition:'grabcut',recognitionPixels:1600,
    recognitionChromaEdges:false
  });
  assert.equal(preserved.recognition,'grabcut');assert.equal(preserved.recognitionPixels,1600);
  assert.equal(preserved.recognitionChromaEdges,false,'explicit settings after migration must be preserved');
  assert.equal(migrateStoredPreferences({recognitionDefaultsVersion:2,recognition:'auto',candidateDiscovery:'legacy'}).candidateDiscovery,'unified');

  const invalid=normalizePreferences({recognition:'fake',recognitionPixels:1234});
  assert.equal(invalid.recognition,'auto');
  assert.equal(normalizePreferences({candidateDiscovery:'nonsense'}).candidateDiscovery,'unified');
  assert.equal(invalid.recognitionPixels,900);
  assert.equal('recognitionEdgePolish' in normalizePreferences({recognitionEdgePolish:true}),false);
  assert.equal('recognitionCurveSmooth' in normalizePreferences({recognitionCurveSmooth:true}),false);
});

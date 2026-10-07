import test from 'node:test';
import assert from 'node:assert/strict';
import {recognitionProfile,recognitionPixelOptions} from '../src/recognition-profiles.js';
import {normalizePreferences} from '../src/preferences.js';

test('validated recognition modes and defaults match the final automatic pipeline',()=>{
  const auto=recognitionProfile('auto',1600);
  assert.equal(auto.analysisMaxDimension,900,'auto is locked to the validated 900 px pipeline');
  assert.equal(typeof auto.refineCandidates,'function');

  const morph=recognitionProfile('morphgac',1200);
  assert.equal(morph.analysisMaxDimension,900,'explicit MorphGAC matches auto exactly');
  assert.equal(typeof morph.refineCandidates,'function');

  assert.equal(recognitionProfile('grabcut',1600).analysisMaxDimension,1600);
  assert.equal(typeof recognitionProfile('grabcut',1600).refineCandidates,'function');
  assert.equal(recognitionProfile('hybrid',1200).analysisMaxDimension,1200);
  assert.equal(typeof recognitionProfile('hybrid',1200).refineCandidates,'function');
  assert.deepEqual(recognitionPixelOptions.map(([value])=>value),[900,1200,1600]);

  const defaults=normalizePreferences({});
  assert.equal(defaults.recognition,'auto');
  assert.equal(defaults.recognitionPixels,900);
  assert.equal(defaults.balanceLight,false);
  assert.equal(defaults.recognitionDenoise,false);
  assert.equal(defaults.recognitionLocalContrast,false);
  assert.equal(defaults.recognitionChromaEdges,true);
  assert.equal(defaults.recognitionShapeRegularization,true);
  assert.equal(defaults.recognitionApertures,true);

  const custom=normalizePreferences({
    recognition:'grabcut',recognitionPixels:1600,balanceLight:true,
    recognitionDenoise:true,recognitionLocalContrast:true,
    recognitionChromaEdges:false,recognitionShapeRegularization:false,
    recognitionApertures:false
  });
  assert.equal(custom.recognition,'grabcut');
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

  const invalid=normalizePreferences({recognition:'fake',recognitionPixels:1234});
  assert.equal(invalid.recognition,'auto');
  assert.equal(invalid.recognitionPixels,900);
});

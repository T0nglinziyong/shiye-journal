import test from 'node:test';
import assert from 'node:assert/strict';
import {recognitionProfile,recognitionPixelOptions} from '../src/recognition-profiles.js';
import {normalizePreferences} from '../src/preferences.js';

test('recognition methods, processing pixels, preprocessing and postprocessing are independent',()=>{
 const auto=recognitionProfile('auto',900);
 assert.equal(auto.analysisMaxDimension,900);
 assert.equal(typeof auto.refineCandidates,'function');
 assert.equal(recognitionProfile('traditional',1600).analysisMaxDimension,1600);
 assert.equal(typeof recognitionProfile('traditional',1600).refineCandidates,'function');
 assert.equal(recognitionProfile('hybrid',1200).analysisMaxDimension,1200);
 assert.equal(typeof recognitionProfile('hybrid',1200).refineCandidates,'function');
 assert.equal(typeof recognitionProfile('active',1200).refineCandidates,'function');
 assert.equal(typeof recognitionProfile('morphgac',1200).refineCandidates,'function');
 assert.equal(typeof recognitionProfile('grabcut',1200).refineCandidates,'function');
 assert.equal(typeof recognitionProfile('slimsam',1200).refineCandidates,'function');
 assert.deepEqual(recognitionPixelOptions.map(([value])=>value),[900,1200,1600]);

 const prefs=normalizePreferences({recognition:'grabcut',recognitionPixels:1600});
 assert.equal(prefs.recognition,'grabcut');
 assert.equal(prefs.recognitionPixels,1600);
 for(const key of [
   'balanceLight','recognitionDenoise','recognitionLocalContrast','recognitionChromaEdges',
   'recognitionEdgePolish','recognitionShapeRegularization','recognitionCurveSmooth',
   'recognitionApertures'
 ])assert.equal(prefs[key],true,key+' defaults on');

 const custom=normalizePreferences({
   recognition:'grabcut',
   recognitionDenoise:false,
   recognitionLocalContrast:false,
   recognitionChromaEdges:false,
   recognitionEdgePolish:false,
   recognitionShapeRegularization:false,
   recognitionCurveSmooth:false,
   recognitionApertures:false
 });
 for(const key of [
   'recognitionDenoise','recognitionLocalContrast','recognitionChromaEdges',
   'recognitionEdgePolish','recognitionShapeRegularization','recognitionCurveSmooth',
   'recognitionApertures'
 ])assert.equal(custom[key],false,key+' can be disabled independently');

 assert.equal(normalizePreferences({recognition:'fake',recognitionPixels:1234}).recognition,'auto');
 assert.equal(normalizePreferences({recognition:'fake',recognitionPixels:1234}).recognitionPixels,1200);
});


test('auto refinement keeps confident candidates on the fast path',async()=>{
  const source=readFileSync(new URL('../src/recognition-refiners.js',import.meta.url),'utf8');
  assert.match(source,/threshold=\.70/);
  assert.match(source,/indices:mode==='auto'\?selectedIndices:null/);
});

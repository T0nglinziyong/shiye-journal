import test from 'node:test';
import assert from 'node:assert/strict';
import {recognitionProfile} from '../src/recognition-profiles.js';
import {normalizePreferences} from '../src/preferences.js';

test('recognition profiles expose fast, Active, hybrid, MorphGAC and model choices',()=>{
 const auto=recognitionProfile('auto',{maxTouchPoints:5,coarsePointer:true});
 assert.equal(auto.analysisMaxDimension,1000);
 assert.equal(typeof auto.refineCandidates,'function');
 assert.equal(recognitionProfile('fast').analysisMaxDimension,900);
 assert.equal(recognitionProfile('detail').analysisMaxDimension,1600);
 assert.equal(recognitionProfile('hybrid').analysisMaxDimension,1000);
 assert.equal(typeof recognitionProfile('hybrid').refineCandidates,'function');
 assert.equal(typeof recognitionProfile('active').refineCandidates,'function');
 assert.equal(typeof recognitionProfile('morphgac').refineCandidates,'function');
 assert.equal(typeof recognitionProfile('grabcut').refineCandidates,'function');
 assert.equal(recognitionProfile('slimsam').analysisMaxDimension,1000);
 assert.equal(normalizePreferences({recognition:'hybrid'}).recognition,'hybrid');
 assert.equal(normalizePreferences({recognition:'active'}).recognition,'active');
 assert.equal(normalizePreferences({recognition:'morphgac'}).recognition,'morphgac');
 assert.equal(normalizePreferences({recognition:'grabcut'}).recognition,'grabcut');
 assert.equal(normalizePreferences({recognition:'slimsam'}).recognition,'slimsam');
 assert.equal(normalizePreferences({recognition:'fake-cloud-model'}).recognition,'auto');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {recognitionProfile,recognitionModeAllowed} from '../src/recognition-profiles.js';
import {normalizePreferences} from '../src/preferences.js';

test('recognition modes expose fast, mixed, contour and model browser engines',()=>{
 assert.equal(recognitionProfile('auto').mode,'auto');
 assert.equal(recognitionProfile('auto').analysisMaxDimension,1200);
 assert.equal(recognitionProfile('fast').analysisMaxDimension,900);
 assert.equal(recognitionProfile('detail').analysisMaxDimension,1600);
 assert.equal(recognitionProfile('active-contour').analysisMaxDimension,1400);
 assert.equal(recognitionProfile('morphgac').analysisMaxDimension,1200);
 assert.equal(recognitionProfile('grabcut').analysisMaxDimension,1200);
 assert.equal(recognitionProfile('slimsam').analysisMaxDimension,1000);
 for(const id of ['auto','fast','standard','detail','active-contour','morphgac','grabcut','slimsam'])assert.ok(recognitionModeAllowed(id),id);
 assert.equal(normalizePreferences({recognition:'active-contour'}).recognition,'active-contour');
 assert.equal(normalizePreferences({recognition:'morphgac'}).recognition,'morphgac');
 assert.equal(normalizePreferences({recognition:'grabcut'}).recognition,'grabcut');
 assert.equal(normalizePreferences({recognition:'slimsam'}).recognition,'slimsam');
 assert.equal(normalizePreferences({recognition:'fake-cloud-model'}).recognition,'auto');
});

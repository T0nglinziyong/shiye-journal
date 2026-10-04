import test from 'node:test';
import assert from 'node:assert/strict';
import {recognitionProfile} from '../src/recognition-profiles.js';
import {normalizePreferences} from '../src/preferences.js';
test('recognition device defaults and explicit overrides affect actual analysis resolution',()=>{
 assert.equal(recognitionProfile('auto',{maxTouchPoints:5,coarsePointer:true}).analysisMaxDimension,1000);
 assert.equal(recognitionProfile('auto',{maxTouchPoints:0,coarsePointer:false}).analysisMaxDimension,1000);
 assert.equal(recognitionProfile('detail',{maxTouchPoints:5,coarsePointer:true}).analysisMaxDimension,1600);
 assert.equal(normalizePreferences({recognition:'detail'}).recognition,'detail');
 assert.equal(normalizePreferences({recognition:'slimsam'}).recognition,'slimsam');
 assert.equal(recognitionProfile('slimsam').analysisMaxDimension,1000);
 assert.equal(normalizePreferences({recognition:'fake-cloud-model'}).recognition,'auto');
});

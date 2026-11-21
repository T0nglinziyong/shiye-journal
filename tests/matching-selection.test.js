import test from 'node:test';
import assert from 'node:assert/strict';
import {addMatchingFromLibrary,addMatchingFromRecommendation} from '../src/matching-selection.js';
import {buildMaterialScope} from '../src/matching-materials.js';

const asset=id=>({id,supply:{kind:'single',quantity:1}});
test('library selection stars items while recommended selection only adds preferred items',()=>{
 const state={assets:[asset('chosen'),asset('suggested')],basket:[],coreIDs:[],excludedAssetIDs:['chosen','suggested']};
 addMatchingFromLibrary(state,['chosen']);
 assert.deepEqual(state.basket,['chosen']);
 assert.deepEqual(state.coreIDs,['chosen']);
 assert.equal(state.matchCore,'chosen');
 assert.equal(addMatchingFromRecommendation(state,'suggested'),true);
 assert.deepEqual(state.coreIDs,['chosen']);
 const scope=buildMaterialScope({basket:state.basket,coreIDs:state.coreIDs,excluded:state.excludedAssetIDs,requireAllCandidates:false});
 assert.deepEqual(scope.required,['chosen']);
 assert.deepEqual(scope.preferred,['suggested']);
});

test('manual star toggles remain authoritative when a recommended material is selected again',()=>{
 const state={assets:[asset('a')],basket:[],coreIDs:['a'],excludedAssetIDs:[]};
 addMatchingFromRecommendation(state,'a');
 assert.deepEqual(state.coreIDs,['a']);
 addMatchingFromLibrary(state,['a']);
 assert.deepEqual(state.coreIDs,['a']);
});

test('inventory fields no longer prevent explicit material selection',()=>{
 const state={assets:[asset('ok'),{...asset('zero'),supply:{quantity:0}}],basket:[],coreIDs:[],excludedAssetIDs:[]};
 assert.deepEqual(addMatchingFromLibrary(state,['ok','zero']),['ok','zero']);
 assert.deepEqual(state.coreIDs,['ok','zero']);
});

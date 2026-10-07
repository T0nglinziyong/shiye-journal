import test from 'node:test';
import assert from 'node:assert/strict';
import {instanceRefinementPlan} from '../src/recognition-instance-refinement.js';

test('very low fill uses one wider local GrabCut even at the page frame',()=>{
  assert.deepEqual(instanceRefinementPlan({
    identityFillRatio:.32,seedDensity:.14,touchesProtectedFrame:true
  }),{kind:'grabcut',padMM:15,reason:'low-fill-carrier'});
});

test('moderate-fill interior identity with strong seeds uses small local GrabCut',()=>{
  assert.deepEqual(instanceRefinementPlan({
    identityFillRatio:.72,seedDensity:.28,touchesProtectedFrame:false
  }),{kind:'grabcut',padMM:10,reason:'moderate-fill-carrier'});
});

test('moderate-fill identity with weak seeds stays on its rough mask',()=>{
  assert.equal(instanceRefinementPlan({
    identityFillRatio:.68,seedDensity:.06,touchesProtectedFrame:false
  }),null);
});

test('high-fill frame identity uses isolated completion',()=>{
  assert.deepEqual(instanceRefinementPlan({
    identityFillRatio:.82,seedDensity:.54,touchesProtectedFrame:true
  }),{kind:'complete',reason:'frame-high-fill'});
});

test('ordinary high-fill interior identity needs no local refiner',()=>{
  assert.equal(instanceRefinementPlan({
    identityFillRatio:.92,seedDensity:.45,touchesProtectedFrame:false
  }),null);
});

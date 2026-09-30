import test from 'node:test';
import assert from 'node:assert/strict';
import {canApplyBackgroundView} from '../src/view-update-policy.js';
const context={route:'library',selectionMode:null,modalOpen:false,popoverOpen:false,inputFocused:false,gestureActive:false};
test('background changes render only on passive screens',()=>{
  for(const route of ['series','library','works','assetDetail','projectPreview'])assert.equal(canApplyBackgroundView({...context,route}),true);
  for(const route of ['editor','import','matching','settings'])assert.equal(canApplyBackgroundView({...context,route}),false);
});
test('user operation has priority over background repaint',()=>{
  for(const change of [{selectionMode:'asset'},{modalOpen:true},{popoverOpen:true},{inputFocused:true},{gestureActive:true}])assert.equal(canApplyBackgroundView({...context,...change}),false);
  assert.equal(canApplyBackgroundView(context),true);
});

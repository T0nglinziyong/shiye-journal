import test from 'node:test';
import assert from 'node:assert/strict';
import {canApplyBackgroundView,shouldPullCloudForRoute} from '../src/view-update-policy.js';
const context={route:'library',selectionMode:null,modalOpen:false,popoverOpen:false,inputFocused:false,gestureActive:false};

test('all non-workspace routes pull cloud changes, including editor and settings',()=>{
  for(const route of ['series','library','works','assetDetail','projectPreview','editor','settings'])
    assert.equal(shouldPullCloudForRoute(route),true,route);
  for(const route of ['matching','import'])
    assert.equal(shouldPullCloudForRoute(route),false,route);
});
test('remote deletion or restore is reflected even during series/material/work selection',()=>{
  for(const route of ['series','library','works','assetDetail','projectPreview'])
    for(const selectionMode of [null,'asset','series','work'])
      assert.equal(canApplyBackgroundView({...context,route,selectionMode}),true,route+':'+selectionMode);
});
test('active editing, dialogs and in-progress gestures still prevent destructive remount',()=>{
  for(const route of ['editor','import','matching','settings'])
    assert.equal(canApplyBackgroundView({...context,route}),false,route);
  for(const change of [{modalOpen:true},{popoverOpen:true},{inputFocused:true},{gestureActive:true}])
    assert.equal(canApplyBackgroundView({...context,...change}),false,JSON.stringify(change));
});

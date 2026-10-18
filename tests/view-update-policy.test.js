import test from 'node:test';
import assert from 'node:assert/strict';
import {canApplyBackgroundView,shouldPullCloudForRoute,shouldRepaintForCollections} from '../src/view-update-policy.js';
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
  assert.equal(canApplyBackgroundView({...context,idleMS:100}),false);
  assert.equal(canApplyBackgroundView({...context,idleMS:900}),true);
});

test('collection pulls yield to active input and recent navigation on every route',async()=>{
 const {canPollDuringEditing}=await import('../src/view-update-policy.js');
 const idle={route:'editor',gestureActive:false,inputFocused:false,idleMS:2000};
 assert.equal(canPollDuringEditing(idle),true);
 assert.equal(canPollDuringEditing({...idle,gestureActive:true}),false);
 assert.equal(canPollDuringEditing({...idle,inputFocused:true}),false);
 assert.equal(canPollDuringEditing({...idle,idleMS:500}),false);
 assert.equal(canPollDuringEditing({...idle,route:'works',idleMS:0}),false);
 assert.equal(canPollDuringEditing({...idle,route:'works',idleMS:1000}),true);
 assert.equal(canPollDuringEditing({...idle,route:'works',gestureActive:true}),false);
});
test('unrelated background commits do not repaint the current catalog',()=>{
  assert.equal(shouldRepaintForCollections('library',['projects']),false);
  assert.equal(shouldRepaintForCollections('works',['series']),false);
  assert.equal(shouldRepaintForCollections('works',['assets','blobs']),false);
  assert.equal(shouldRepaintForCollections('library',['assets']),true);
  assert.equal(shouldRepaintForCollections('works',['projects','trash']),true);
  assert.equal(shouldRepaintForCollections('assetDetail',['meta']),true);
  assert.equal(shouldRepaintForCollections('works',['meta'],[
    {store:'meta',id:'app-matching-defaults',action:'put'}]),false);
  assert.equal(shouldRepaintForCollections('library',['meta'],[
    {store:'meta',id:'app-ai-settings',action:'put'}]),false);
  assert.equal(shouldRepaintForCollections('works',['meta'],[
    {store:'meta',id:'app-ui-preferences',action:'put'}]),true);
});

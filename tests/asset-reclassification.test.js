import assert from 'node:assert/strict';
import test from 'node:test';
import {beginAssetReclassification,pendingReclassifications,runAssetReclassification} from '../src/asset-reclassification.js';
import {createAssetOrganization} from '../src/asset-organization.js';
import {applyAIClassification,initialMaterialClassification} from '../src/material-classification.js';

test('reclassification persists pending review and resumes after a new session',async()=>{
 const old={id:'a',title:'旧名',reviewStatus:'ready',reviewStatusSource:'ai',updatedAt:'old',
  ...initialMaterialClassification({kind:'sticker',role:'accent'})};
 const state={assets:[old],accountId:'account',route:'library'};
 const saved=new Map();let refreshes=0,calls=0;
 const db={transaction:async(_stores,fn)=>fn({objectStore:()=>({put:asset=>saved.set(asset.id,structuredClone(asset))})}),
  flushProjects:async()=>{},refreshCloud:async()=>{refreshes++;}};
 const pending=await beginAssetReclassification([structuredClone(old)],{db,state});
 assert.equal(state.assets[0].reviewStatus,'pendingReview');
 assert.equal(saved.get('a').reviewStatus,'pendingReview');
 assert.equal(pendingReclassifications([...saved.values()]).length,1);
 const cloudResult={...pending[0],title:'新名',reviewStatus:'ready',updatedAt:'done'};
 delete cloudResult.reclassificationPendingAt;
 // The reopened app sees the durable pending record and can finish the job.
 const reopened={...state,assets:[structuredClone(saved.get('a'))]};
 await runAssetReclassification(pendingReclassifications(reopened.assets),{
  db,state:reopened,assetOrganization:createAssetOrganization(),background:true,
  classify:async()=>{calls++;return cloudResult;}});
 assert.equal(calls,1);
 assert.equal(reopened.assets[0].reviewStatus,'ready');
 assert.equal(pendingReclassifications(reopened.assets).length,0);
 assert.equal(refreshes,1);
});

test('successful classification clears the pending marker',()=>{
 const old={id:'a',title:'旧名',reviewStatus:'pendingReview',reviewStatusSource:'reclassification',
  reclassificationPendingAt:'2026-01-01T00:00:00Z',...initialMaterialClassification({kind:'sticker',role:'accent'})};
 const next=applyAIClassification(old,{modelVersion:'test',kind:{id:'sticker',confidence:1},
  role:{id:'accent',confidence:1}},{minConfidence:.6});
 assert.equal(next.reviewStatus,'ready');
 assert.equal(next.reclassificationPendingAt,undefined);
});

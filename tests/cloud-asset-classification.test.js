import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFreshClassification,classifyCloudAsset} from '../src/cloud-asset-classification.js';

test('late classification cannot overwrite a user review change',()=>{
  const requested={id:'a',updatedAt:'before',reviewStatus:'ready'};
  const current={id:'a',updatedAt:'after',reviewStatus:'pendingReview',reviewStatusSource:'user'};
  assert.equal(applyFreshClassification(current,requested,{...requested,reviewStatus:'ready'}),false);
  assert.equal(current.reviewStatus,'pendingReview');
  assert.equal(applyFreshClassification(requested,requested,{...requested,title:'已整理'}),true);
  assert.equal(requested.title,'已整理');
});

test('batch classification uses returned assets and defers cloud refresh',async()=>{
  let flushes=0,refreshes=0,requests=0;
  const db={flushProjects:async()=>{flushes++;},refreshCloud:async()=>{refreshes++;}};
  const request=async(route,options)=>{
    assert.equal(route,'/api/classify-asset');
    const {assetId}=JSON.parse(options.body);requests++;
    return Response.json({asset:{id:assetId,title:'已分类'}});
  };
  const results=await Promise.all(['a','b','c'].map(id=>
    classifyCloudAsset(id,{db,request,skipFlush:true,skipRefresh:true})));
  assert.deepEqual(results.map(asset=>asset.id),['a','b','c']);
  assert.equal(requests,3);assert.equal(flushes,0);assert.equal(refreshes,0);
  await db.refreshCloud();
  assert.equal(refreshes,1);
});
test('cloud classification ignores obsolete orientation suggestions',async()=>{
  const db={flushProjects:async()=>{},refreshCloud:async()=>{}};
  let rotated=false;
  const result=await classifyCloudAsset('material',{db,skipFlush:true,skipRefresh:true,
    request:async()=>Response.json({asset:{id:'material',title:'已分类'},
      orientation:{deltaDegrees:90,confidence:.93}}),
    onOrientation:async()=>{rotated=true;}});
  assert.equal(result.title,'已分类');
  assert.equal(rotated,false);
});

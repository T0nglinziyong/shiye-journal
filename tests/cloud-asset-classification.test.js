import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCloudAsset} from '../src/cloud-asset-classification.js';

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

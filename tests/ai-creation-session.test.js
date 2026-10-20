import test from 'node:test';
import assert from 'node:assert/strict';
import {project as createProject} from '../src/domain.js';
import {creativeRunParameters,createCreativeRunGuard,prepareCreativeRunInputs,createCreativeCheckpoint,hasCreativeSceneChange} from '../src/ai-creation-session.js';

test('matching and editor derive one set of AI inputs from the same project',async()=>{
  const p=createProject('旅途');p.styles=['拼贴'];p.purposes=['旅行记录'];p.requiredAssetIDs=['a'];p.userText='原文';
  const assets=[{id:'a',title:'照片',blobId:'photo-v1'}],settings={model:'example',supportsVision:false,sendPresetReferences:true};
  const options=creativeRunParameters({project:p,draft:p.drafts[0],assets,ids:['a'],settings,prompt:'春日'});
  assert.equal(options.prompt,'春日');assert.deepEqual(options.aliases,{asset_YQ:'a'});
  assert.deepEqual(options.pagePurposes,['旅行记录']);assert.deepEqual(options.requiredAssetIDs,['a']);
  const guard=createCreativeRunGuard({accountID:'owner',ids:['a'],assets,getAccount:()=> 'owner',getAsset:id=>assets.find(a=>a.id===id),signal:new AbortController().signal});
  const inputs=await prepareCreativeRunInputs({project:p,draft:p.drafts[0],assets,ids:['a'],settings,createImage:()=>{throw Error('no vision');},loadReferences:()=>{throw Error('no vision');},guard});
  assert.deepEqual(inputs,{images:[],referenceImages:[]});
  assert.equal(hasCreativeSceneChange([{ok:true,name:'inspect_materials'}]),false);
  assert.equal(hasCreativeSceneChange([{ok:true,name:'upsert_text'}]),true);
  assets[0].blobId='photo-v2';assert.throws(guard,/素材来源/);
});

test('every AI checkpoint persists the frozen target and continues in its own candidate after a manual edit',async()=>{
  const p=createProject('日记'),original=structuredClone(p.drafts[0]);let writes=0;
  const checkpoint=createCreativeCheckpoint({getProject:()=>p,targetDraftID:original.id,expectedDraft:original,newDraftID:()=> 'ai-candidate',persist:async()=>{writes++;}});
  const first=structuredClone(original);first.title='AI 第一轮';
  await checkpoint.commit(first);assert.equal(p.drafts[0].title,'AI 第一轮');assert.equal(writes,1);
  p.drafts[0].title='手工修改';
  const second=structuredClone(first);second.title='AI 第二轮';
  const result=await checkpoint.commit(second);
  assert.equal(result.candidate,true);assert.equal(checkpoint.targetDraftID,'ai-candidate');
  assert.equal(p.drafts[0].title,'手工修改');assert.equal(p.drafts[1].title,'AI 第二轮 · AI 候选');
  const third=structuredClone(second);third.title='AI 第三轮';
  await checkpoint.commit(third);
  assert.equal(p.drafts.length,2);assert.equal(p.drafts[1].title,'AI 第三轮');assert.equal(writes,3);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {applyScenePatch,patchSceneHash} from '../src/scene-patch.js';

test('A-03 stale base rejects the entire patch and preserves later manual edits',async()=>{
  const base=draft();
  const oldHash=await patchSceneHash(base);
  base.textBlocks.push({id:'manual',content:'后来手写的正文',x:10,y:10,width:100,height:50,rotation:0,zIndex:1,fontSize:20});
  const before=structuredClone(base);
  const result=await applyScenePatch({mode:'applyPatch',baseSceneHash:oldHash,tools:[{name:'set_paper',arguments:{color:'#ffffff'}}]},base,[]);
  assert.equal(result.committed,false);
  assert.equal(result.results[0].code,'stale-base');
  assert.deepEqual(result.draft,before);
  assert.deepEqual(base,before);
});

test('A-03 valid patch retains independent successful prefix but does not finish after an error',async()=>{
  const base=draft();
  const hash=await patchSceneHash(base);
  const result=await applyScenePatch({mode:'applyPatch',baseSceneHash:hash,tools:[
    {name:'upsert_text',arguments:{items:[{key:'patch-note',content:'完整保留的正文',width:.4}]}},
    {name:'upsert_primitives',arguments:{items:[{key:'bad',kind:'not-a-shape'}]}},
    {name:'finish_design',arguments:{summary:'错误未修复'}}
  ]},base,[]);
  assert.deepEqual(result.results.map(row=>row.ok),[true,false,false]);
  assert.equal(result.draft.textBlocks[0].content,'完整保留的正文');
  assert.equal(result.draft.primitives.length,0);
  assert.notEqual(result.draft.agentRun?.status,'finished');
  assert.equal(base.textBlocks.length,0);
});

test('A-03 patch preserves unspecified layers and rejects a full-scene command',async()=>{
  const base=draft();
  base.textBlocks.push({id:'manual',content:'用户原文',x:10,y:10,width:100,height:50,rotation:0,zIndex:1,fontSize:20});
  const hash=await patchSceneHash(base);
  const result=await applyScenePatch({mode:'applyPatch',baseSceneHash:hash,tools:[{name:'set_paper',arguments:{color:'#fffbea'}}]},base,[]);
  assert.equal(result.results[0].ok,true);
  assert.equal(result.draft.paperColor,'#fffbea');
  assert.equal(result.draft.textBlocks[0].content,'用户原文');
  await assert.rejects(applyScenePatch({mode:'applyPatch',baseSceneHash:hash,tools:[{name:'compose_direct_page',arguments:{}}]},base,[]),/整页生成不能作为增量修订/);
});

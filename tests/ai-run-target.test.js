import test from 'node:test';
import assert from 'node:assert/strict';
import {commitAIDraft} from '../src/ai-run-target.js';

const draft=id=>({id,title:'方案',canvas:{width:700,height:1000},textBlocks:[{content:'原文'}],items:[],primitives:[],strokes:[]});
test('A-04: committed AI turn targets its frozen draft, not the newly active draft',()=>{
 const base=draft('a'),project={drafts:[structuredClone(base),draft('b')],activeDraftID:'b'};
 const generated={...structuredClone(base),textBlocks:[{content:'AI 页面'}]};
 const result=commitAIDraft(project,{targetDraftID:'a',expectedDraft:base,generatedDraft:generated,newDraftID:'candidate'});
 assert.equal(result.candidate,false);assert.equal(project.drafts[0].textBlocks[0].content,'AI 页面');
 assert.equal(project.drafts[1].textBlocks[0].content,'原文');assert.equal(project.activeDraftID,'b');
});
test('A-05: a manual edit causes a separate candidate, never overwrites user text',()=>{
 const base=draft('a'),project={drafts:[structuredClone(base)],activeDraftID:'a'};
 project.drafts[0].textBlocks[0].content='我刚刚手改';
 const generated={...structuredClone(base),textBlocks:[{content:'AI 页面'}]};
 const result=commitAIDraft(project,{targetDraftID:'a',expectedDraft:base,generatedDraft:generated,newDraftID:'candidate'});
 assert.equal(result.candidate,true);assert.equal(project.drafts[0].textBlocks[0].content,'我刚刚手改');
 assert.equal(project.drafts[1].id,'candidate');assert.equal(project.drafts[1].textBlocks[0].content,'AI 页面');
 assert.equal(project.activeDraftID,'a');
 const next={...structuredClone(generated),textBlocks:[{content:'AI 第二轮'}]};
 const continued=commitAIDraft(project,{targetDraftID:result.targetDraftID,expectedDraft:result.expectedDraft,generatedDraft:next,newDraftID:'unused'});
 assert.equal(continued.candidate,false);assert.equal(project.drafts.length,2);assert.equal(project.drafts[1].textBlocks[0].content,'AI 第二轮');
});
test('A-05: removed target fails instead of resurrecting or writing another draft',()=>{
 const project={drafts:[draft('b')]};
 assert.throws(()=>commitAIDraft(project,{targetDraftID:'a',expectedDraft:draft('a'),generatedDraft:draft('a'),newDraftID:'candidate'}),/不存在/);
 assert.deepEqual(project.drafts.map(d=>d.id),['b']);
});

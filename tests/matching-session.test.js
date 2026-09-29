import test from 'node:test';import assert from 'node:assert/strict';
import {matchingSnapshot,restoreMatchingSession,variantDraftProject} from '../src/matching-session.js';
test('matching results survive reload without credentials; interrupted requests do not resume',()=>{
 const state={basket:['a'],aiSettings:{key:'never-store'},matchIntent:'春日'},record=matchingSnapshot(state,[{id:'v',status:'running',project:{id:'p'}}]);
 assert.ok(!JSON.stringify(record).includes('never-store'));const restored={};const variants=restoreMatchingSession(record,restored);assert.deepEqual(restored.basket,['a']);assert.equal(variants[0].status,'interrupted');
});
test('opening a result reuses its draft but never demotes an existing work',()=>{
 const v={project:{id:'source',drafts:[{id:'d'}],isDraft:true}},existing={id:'old',isDraft:true};assert.equal(variantDraftProject(v,existing,'new'),existing);
 const copy=variantDraftProject(v,{id:'work',isDraft:false},'new');assert.equal(copy.id,'new');assert.equal(copy.isDraft,true);assert.equal(v.project.id,'source');
});

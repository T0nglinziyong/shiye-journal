import test from 'node:test';import assert from 'node:assert/strict';
import {matchingSnapshot,restoreMatchingSession,variantDraftProject,createMatchingSession} from '../src/matching-session.js';
test('matching results survive reload without credentials; interrupted requests do not resume',()=>{
 const state={basket:['a'],aiSettings:{key:'never-store'},matchIntent:'春日'},record=matchingSnapshot(state,[{id:'v',status:'running',project:{id:'p'}}]);
 assert.ok(!JSON.stringify(record).includes('never-store'));const restored={};const variants=restoreMatchingSession(record,restored);assert.deepEqual(restored.basket,['a']);assert.equal(variants[0].status,'interrupted');
});
test('completed unopened variants become drafts before reset; reload never duplicates them',async()=>{
 const tables={projects:new Map(),meta:new Map()},state={projects:[]};let id=0;
 const db={get:async(s,id)=>tables[s].get(id),put:async(s,r)=>tables[s].set(r.id,structuredClone(r)),transaction:async(_,fn)=>fn({objectStore:s=>({put:r=>tables[s].set(r.id,structuredClone(r))})})};
 tables.meta.set('matching-session-v1',{context:{},variants:[{id:'v',status:'completed',project:{id:'p',drafts:[{id:'d'}]}}]});
 const c={state,db,uid:()=>String(++id)},session=createMatchingSession(c);await session.restore();assert.equal(tables.projects.size,1);assert.ok([...tables.projects.values()][0].isDraft);
 state.projects=[];await createMatchingSession(c).restore();assert.equal(tables.projects.size,1);await session.reset();assert.equal(tables.meta.get('matching-session-v1').variants.length,0);assert.equal(tables.projects.size,1);
});
test('opening a result reuses its draft but never demotes an existing work',()=>{
 const v={project:{id:'source',drafts:[{id:'d'}],isDraft:true}},existing={id:'old',isDraft:true};assert.equal(variantDraftProject(v,existing,'new'),existing);
 const copy=variantDraftProject(v,{id:'work',isDraft:false},'new');assert.equal(copy.id,'new');assert.equal(copy.isDraft,true);assert.equal(v.project.id,'source');
});
test('re-pairing clears context only after durable staging and rolls back on failure',async()=>{
  const state={basket:['a'],coreIDs:['a'],matchCore:'a',projects:[]},record={id:'matching-session-v1',context:{basket:['a'],coreIDs:['a'],matchCore:'a'},variants:[]};let fail=true;
  const db={get:async()=>record,put:async()=>{if(fail)throw Error('quota');}};
  const session=createMatchingSession({state,db});await session.restore();
  const clear=()=>{state.basket=[];state.coreIDs=[];state.matchCore=null;};
  await assert.rejects(session.reset(clear),/quota/);assert.deepEqual(state.basket,['a']);assert.equal(state.matchCore,'a');
  fail=false;await session.reset(clear);assert.deepEqual(state.basket,[]);assert.equal(state.matchCore,null);
});

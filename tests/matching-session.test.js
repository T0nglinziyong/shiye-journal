import test from 'node:test';import assert from 'node:assert/strict';
import {matchingSnapshot,restoreMatchingSession,variantDraftProject,createMatchingSession} from '../src/matching-session.js';
const draft={id:'d',canvas:{width:700,height:1000},items:[],textBlocks:[],primitives:[],strokes:[]};
const work={id:'p',activeDraftID:'d',drafts:[draft]};
test('matching results survive reload without credentials; interrupted requests do not resume',()=>{
 const state={basket:['a'],aiSettings:{key:'never-store'},matchIntent:'春日'},record=matchingSnapshot(state,[{id:'v',status:'running',project:work}]);
 assert.ok(!JSON.stringify(record).includes('never-store'));const restored={};const variants=restoreMatchingSession(record,restored);assert.deepEqual(restored.basket,['a']);assert.equal(variants[0].status,'interrupted');
});
test('old autonomous label is normalized once to the current unspecified label',()=>{
 const state={matchProcessing:'保留完整'};restoreMatchingSession({context:{matchProcessing:'AI 自主加工'},variants:[]},state);assert.equal(state.matchProcessing,'不预设');
});
test('content policy, original wording and facts survive matching-page reload',()=>{
 const record=matchingSnapshot({matchContentPolicy:'original',matchUserText:'保留原文',matchFacts:'用户确认的事实',basket:[]},[]);
 const restored={matchContentPolicy:'documentary',matchUserText:'',matchFacts:''};
 restoreMatchingSession(record,restored);
 assert.equal(restored.matchContentPolicy,'original');assert.equal(restored.matchUserText,'保留原文');assert.equal(restored.matchFacts,'用户确认的事实');
});
test('damaged or partial generated plans do not reappear as unopenable shells',()=>{
 const result=restoreMatchingSession({context:{basket:['a']},variants:[{id:'broken',status:'completed',project:{id:'p'}},{id:'good',status:'running',project:work}]},{});
 assert.deepEqual(result.map(v=>v.id),['good']);assert.equal(result[0].status,'interrupted');
 assert.deepEqual(restoreMatchingSession({variants:{}},{}),[]);
});
test('completed unopened variants become drafts before reset; reload never duplicates them',async()=>{
 const tables={projects:new Map(),meta:new Map()},state={projects:[]};let id=0;
 const db={get:async(s,id)=>tables[s].get(id),put:async(s,r)=>tables[s].set(r.id,structuredClone(r)),transaction:async(_,fn)=>fn({objectStore:s=>({put:r=>tables[s].set(r.id,structuredClone(r))})})};
 tables.meta.set('matching-session-v1',{context:{},variants:[{id:'v',status:'completed',project:work}]});
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
test('opening or rerendering matching does not stage an unchanged session',async()=>{
 const state={basket:['a'],projects:[]},record=matchingSnapshot(state,[]);let writes=0;
 const db={get:async()=>record,put:async()=>{writes++;throw Error('offline');}};
 const session=createMatchingSession({state,db});
 await session.persist();assert.equal(writes,0);
 await session.restore();await session.persist();await session.persist();assert.equal(writes,0);
 state.basket=['a','b'];await assert.rejects(session.persist(),/offline/);assert.equal(writes,1);
});
test('reloading after local outbox discard resets an unsaved basket without saving it again',async()=>{
 const state={basket:[],coreIDs:[],projects:[]};let writes=0;
 const db={get:async()=>undefined,put:async()=>{writes++;}};
 const session=createMatchingSession({state,db});await session.restore();
 state.basket=['unsent'];await session.restore();await session.persist();
 assert.deepEqual(state.basket,[]);assert.equal(writes,0);
});
test('I-05: a failed editable import never leaks a variant into a concurrent matching save',async()=>{
 const state={basket:[],projects:[],route:'library'},records=new Map();let release;
 const blocked=new Promise(resolve=>release=resolve);
 const db={get:async(_store,id)=>records.get(id),put:async(_store,record)=>records.set(record.id,structuredClone(record)),transaction:async()=>{await blocked;throw Error('storage transaction failed');}};
 const session=createMatchingSession({state,db,uid:()=>crypto.randomUUID()});await session.restore();
 const incoming={...work,title:'应当拒绝的作品',isDraft:true};
 const attempt=session.importProject(incoming);
 const otherSave=session.persist();
 release();await assert.rejects(attempt,/storage transaction failed/);await otherSave;
 assert.deepEqual(state.projects,[]);
 assert.doesNotMatch(session.render(),/应当拒绝的作品/);
 assert.deepEqual(records.get('matching-session-v1')?.variants||[],[]);
});
test('web image import links an already staged snapshot without writing a duplicate project',async()=>{
 const state={basket:[],projects:[],route:'library'},records=new Map(),scopes=[];
 const db={get:async(_store,id)=>records.get(id),put:async(_store,record)=>records.set(record.id,structuredClone(record)),transaction:async(stores,fn)=>{scopes.push(stores);fn({objectStore:name=>({put:record=>records.set(record.id,structuredClone(record))})});}};
 const session=createMatchingSession({state,db,uid:()=>crypto.randomUUID(),esc:value=>String(value),workCover:()=>''});await session.restore();
 const snapshot={id:'image-1',title:'生成画面',isSnapshot:true,snapshotBlobId:'blob-1',createdAt:new Date().toISOString()};
 await session.importProject(snapshot,{alreadyStored:true});
 assert.deepEqual(scopes,[['meta']]);
 assert.equal(records.has('image-1'),false);
 assert.equal(state.projects[0].id,'image-1');
 assert.match(session.render(),/画面图片已导入快照/);
 assert.doesNotMatch(session.render(),/返回时保留草稿/);
});

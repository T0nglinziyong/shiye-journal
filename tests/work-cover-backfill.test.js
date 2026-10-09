import test from 'node:test';
import assert from 'node:assert/strict';
import {needsWorkCover,createWorkCoverBackfill} from '../src/work-cover-backfill.js';

const project=(id='p')=>({
  id,title:'可编辑作品',updatedAt:'2026-10-09T02:00:00.000Z',
  activeDraftID:'d',drafts:[{id:'d',items:[{assetID:'m',x:3}],primitives:[],textBlocks:[]}]
});
test('COS backfill never targets snapshots or a work with an existing preview',()=>{
  assert.equal(needsWorkCover({...project(),isSnapshot:true}),false);
  assert.equal(needsWorkCover({...project(),drafts:[{id:'d',coverImageID:'project-cover:cos:user/hash'}]}),false);
  assert.equal(needsWorkCover({...project(),coverStaticPath:'/presets/a.png',coverBaselineUpdatedAt:project().updatedAt}),false);
  assert.equal(needsWorkCover({...project(),isDraft:true}),true);
});
test('backfill stages exact complete document just once without touching edits or timestamps',async()=>{
  const original=project(),rows=[original],staged=[],db={
    pendingProjects:async()=>[],completeProject:async p=>p,
    stageProject:async p=>staged.push(p)
  },state={route:'works',accountId:'account',projects:rows,activeProject:null};
  const manager=createWorkCoverBackfill({db,state,cloudEnabled:true});
  manager.enqueue(original.id,original.updatedAt);
  manager.enqueue(original.id,original.updatedAt);
  await manager.whenIdle();
  assert.equal(staged.length,1);
  assert.deepEqual(staged[0],original);
  assert.notEqual(staged[0],original);
  assert.equal(original.drafts[0].coverImageID,undefined);
  manager.enqueue(original.id,original.updatedAt);
  await manager.whenIdle();assert.equal(staged.length,1);
});
test('thin project summary must be expanded before durable staging',async()=>{
  const summary={...project(),projectDocumentPath:'uid/large.json.gz',drafts:[{id:'d',items:[]}]},
    full={...project(),drafts:[{id:'d',items:[{assetID:'keep-me'}],textBlocks:[]}]};
  let loaded=0;const staged=[];
  const manager=createWorkCoverBackfill({
    db:{pendingProjects:async()=>[],completeProject:async p=>{loaded++;assert.equal(p,summary);return full;},stageProject:async p=>staged.push(p)},
    state:{route:'works',projects:[summary]},cloudEnabled:true
  });
  manager.enqueue(summary.id,summary.updatedAt);await manager.whenIdle();
  assert.equal(loaded,1);assert.equal(staged.length,1);
  assert.deepEqual(staged[0].drafts[0].items,full.drafts[0].items);
});
test('pending, actively edited and stale projects are never overwritten',async()=>{
  const original=project();let staged=0;
  const state={route:'works',projects:[original],activeProject:{id:'p'}};
  const db={pendingProjects:async()=>[{record:original}],stageProject:async()=>staged++};
  const manager=createWorkCoverBackfill({db,state,cloudEnabled:true});
  manager.enqueue('p',original.updatedAt);await manager.whenIdle();
  assert.equal(staged,0);state.activeProject=null;
  original.updatedAt='newer';
  manager.enqueue('p','2026-10-09T02:00:00.000Z');await manager.whenIdle();
  assert.equal(staged,0);
});


test('background backfill may stage a historical draft outside the Works route',async()=>{
  const p=project('background'),state={route:'library',accountId:'a',projects:[p]},staged=[];
  const manager=createWorkCoverBackfill({db:{
    pendingProjects:async()=>[],stageProject:async doc=>staged.push(doc)
  },state,cloudEnabled:true});
  manager.enqueue(p.id,p.updatedAt);
  await manager.whenIdle();
  assert.equal(staged.length,1);
  assert.equal(staged[0].id,p.id);
});

test('a pending edit is skipped without permanently suppressing a later safe retry',async()=>{
  const p=project('later'),state={route:'library',accountId:'a',projects:[p]},staged=[];
  let pending=true;
  const manager=createWorkCoverBackfill({db:{
    pendingProjects:async()=>pending?[{record:{id:p.id}}]:[],
    stageProject:async doc=>staged.push(doc)
  },state,cloudEnabled:true});
  manager.enqueue(p.id,p.updatedAt);
  await manager.whenIdle();
  assert.equal(staged.length,0);
  pending=false;
  manager.enqueue(p.id,p.updatedAt);
  await manager.whenIdle();
  assert.equal(staged.length,1);
});

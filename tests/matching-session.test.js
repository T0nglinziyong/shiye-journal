import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingSnapshot,restoreMatchingSession,variantDraftProject,createMatchingSession} from '../src/matching-session.js';

const draft={id:'d',sceneVersion:2,canvas:{width:700,height:1000},layers:[]};
const work={id:'p',activeDraftID:'d',drafts:[draft]};
const memoryDevice=()=>{
  const rows=new Map(),writes=[];
  return {
    rows,writes,
    get:async(account,id)=>structuredClone(rows.get(JSON.stringify([account,id]))||null),
    put:async(account,record)=>{writes.push([account,record.id]);rows.set(JSON.stringify([account,record.id]),structuredClone(record));},
    delete:async(account,id)=>rows.delete(JSON.stringify([account,id]))
  };
};
const memoryProjects=()=>{
  const projects=new Map(),writes=[];
  return {
    projects,writes,
    stageProject:async record=>{writes.push(record.id);projects.set(record.id,structuredClone(record));},
    transaction:async(stores,fn)=>{
      assert.deepEqual(stores,['projects'],'operational matching state must never enter cloud meta');
      fn({objectStore:name=>({
        put:record=>{assert.equal(name,'projects');writes.push(record.id);projects.set(record.id,structuredClone(record));}
      })});
    }
  };
};
const context=(state,device,db=memoryProjects())=>({
  state:{accountId:'test-user',projects:[],route:'library',...state},
  deviceRecords:device,db,uid:()=>crypto.randomUUID(),esc:String,workCover:()=>'',flushSave:async()=>{},route:()=>{}
});

test('snapshot excludes credentials and restores editable local controls',()=>{
 const record=matchingSnapshot({basket:['a'],aiSettings:{key:'never-store'},matchIntent:'春日',matchAutoUsePresets:true},[{id:'v',status:'running',project:work}]);
 assert.ok(!JSON.stringify(record).includes('never-store'));
 const restored={};const variants=restoreMatchingSession(record,restored);
 assert.deepEqual(restored.basket,['a']);assert.equal(restored.matchAutoUsePresets,true);assert.equal(variants[0].status,'interrupted');
 assert.equal(restoreMatchingSession({variants:{}},{}).length,0);
 assert.equal(restoreMatchingSession({variants:[{id:'bad',status:'completed',project:{id:'p'}}]},{}).length,0);
});
test('matching content and handwriting mode persist without obsolete fact fields',()=>{
 const restored={},snapshot=matchingSnapshot({matchContentPolicy:'original',matchTextPresentation:'handwritten',matchIntent:'给猫咪写日记'},[]);
 snapshot.context.matchProcessing='AI 自主加工';
 restoreMatchingSession(snapshot,restored);
 assert.equal(restored.matchProcessing,undefined);
 assert.equal(restored.matchTextPresentation,undefined);
 assert.equal(restored.matchIntent,'给猫咪写日记');
 assert.equal('matchUserText' in snapshot.context,false);
});
test('matching basket persists only in local IndexedDB adapter, not cloud',async()=>{
 const device=memoryDevice(),db=memoryProjects(),c=context({basket:['a']},device,db);
 const session=createMatchingSession(c);
 await session.restore();
 c.state.basket=['a','b'];await session.persist();await session.persist();
 assert.deepEqual((await device.get('test-user','matching-session-v1')).context.basket,['a','b']);
 assert.deepEqual(db.writes,[],'no cloud project or meta mutation for basket/filter changes');
 assert.equal(device.writes.length,1,'identical UI snapshots must be de-duplicated');
});
test('device sessions are isolated by account, same browser',async()=>{
 const device=memoryDevice(),shared=memoryProjects();
 const a=context({accountId:'account-A',basket:[]},device,shared),b=context({accountId:'account-B',basket:[]},device,shared);
 const sa=createMatchingSession(a);await sa.restore();a.state.basket=['secret'];await sa.persist();
 const sb=createMatchingSession(b);await sb.restore();
 assert.deepEqual(b.state.basket,[]);
 assert.equal(await device.get('account-B','matching-session-v1'),null);
});
test('reopening and resetting matching history never resurrects a deleted cloud work',async()=>{
 const device=memoryDevice(),db=memoryProjects();
 const record=matchingSnapshot({basket:['a']},[{id:'variant',status:'completed',project:work,linkedProjectID:'p'}]);
 await device.put('test-user',record);
 const c=context({},device,db),session=createMatchingSession(c);
 await session.restore();assert.equal(db.writes.length,0);
 await createMatchingSession(c).restore();assert.equal(db.writes.length,0);
 await session.reset();assert.equal(db.writes.length,0);
 assert.deepEqual((await device.get('test-user','matching-session-v1')).variants,[]);
});
test('a deleted matching result can be written back only after explicit restoreDeleted',async()=>{
 const device=memoryDevice(),writes=[];
 const db={transaction:async(names,fn)=>{
   assert.deepEqual(names,['projects','meta','trash']);
   fn({objectStore:store=>({
     put:record=>writes.push([store,'put',record.id]),
     delete:id=>writes.push([store,'delete',id])
   })});
 }};
 const restoredWork={...work,title:'手工搭配',isDraft:true};
 await device.put('test-user',matchingSnapshot({},[{id:'variant',status:'completed',project:restoredWork,linkedProjectID:'p'}]));
 const c=context({projects:[],trash:[{id:'trash-p',kind:'project',item:restoredWork}]},device,db);
 c.toast=()=>{};
 const session=createMatchingSession(c);await session.restore();
 await session.open('variant');
 assert.equal(writes.length,0,'opening the local history is not permission to resurrect a deleted work');
 assert.equal(await session.restoreDeleted('variant'),true);
 assert.deepEqual(writes,[['meta','delete','tombstone:projects:p'],['trash','delete','trash-p'],['projects','put','p']]);
 assert.equal(c.state.projects.length,1);
 assert.equal(await session.restoreDeleted('variant'),false,'repeat recovery must be a no-op');
});
test('failed local session writes roll back UI state and do not delete cloud works',async()=>{
 const device=memoryDevice(),db=memoryProjects(),c=context({basket:['a'],coreIDs:['a'],matchCore:'a'},device,db);
 const session=createMatchingSession(c);await session.restore();let fail=true;
 const originalPut=device.put;device.put=async(...args)=>{if(fail)throw Error('device quota');return originalPut(...args);};
 const clear=()=>{c.state.basket=[];c.state.coreIDs=[];c.state.matchCore=null;};
 await assert.rejects(session.reset(clear),/device quota/);
 assert.deepEqual(c.state.basket,['a']);assert.equal(c.state.matchCore,'a');
 fail=false;await session.reset(clear);assert.deepEqual(c.state.basket,[]);
 assert.equal(db.projects.size,0);
});
test('local UI save not triggered merely by reopening the same state',async()=>{
 const device=memoryDevice(),c=context({basket:['a']},device),session=createMatchingSession(c);
 await session.persist();assert.equal(device.writes.length,0);
 await session.restore();await session.persist();await session.persist();
 assert.equal(device.writes.length,0);
});
test('variant drafts reuse drafts but never convert published editable work to draft',()=>{
 const v={project:{id:'source',drafts:[draft],activeDraftID:'d',isDraft:true}};
 assert.equal(variantDraftProject(v,{id:'keep',isDraft:true},'new').id,'keep');
 const copied=variantDraftProject(v,{id:'published',isDraft:false},'new');
 assert.equal(copied.isDraft,true);assert.equal(copied.id,'new');
});
test('failed cloud import never produces a local matching variant',async()=>{
 const device=memoryDevice(),db=memoryProjects(),c=context({},device,db),session=createMatchingSession(c);
 await session.restore();
 db.stageProject=async()=>{throw Error('cloud offline');};
 await assert.rejects(session.importProject({...work,title:'do-not-stage',isDraft:true}),/cloud offline/);
 assert.deepEqual(c.state.projects,[]);
 assert.equal(device.writes.length,0);
});
test('already-stored snapshots add only local matching reference, no second cloud write',async()=>{
 const device=memoryDevice(),db=memoryProjects(),c=context({},device,db),session=createMatchingSession(c);
 await session.restore();
 const snapshot={id:'snap',title:'静态画面',isSnapshot:true,snapshotBlobId:'blob',drafts:[draft]};
 await session.importProject(snapshot,{alreadyStored:true});
 assert.deepEqual(db.writes,[]);
 assert.equal(c.state.projects[0].id,'snap');
 assert.match(JSON.stringify(await device.get('test-user','matching-session-v1')),/snap/);
});

test('matching AI receives the selected text presentation for its editable Scene',async()=>{
 const device=memoryDevice(),db=memoryProjects();
 const c=context({aiSettings:{key:'test-key',model:'test-model',deliveryMode:'editable'},
   assets:[],userTemplates:[]},device,db);
 const p={...structuredClone(work),textPresentation:'handwritten',candidateAssetIDs:[],
   styles:['airy'],purposes:['日常记录'],title:'AI 方案',isDraft:true};
 let received;
 Object.assign(c,{createProject:()=>p,createAIRecorder:async()=>({request:()=>{},
   response:()=>{},finish:async()=>{}}),supportsVision:()=>false,
 runCreativeAgent:async options=>{received=options;return {draft:options.draft};}});
 const session=createMatchingSession(c);await session.restore();await session.generate();
 assert.equal(received?.textPresentation,'handwritten');
 assert.equal(c.state.projects[0]?.drafts[0]?.sceneVersion,2);
});

test('editable matching imports and newly opened variants use one durable project outbox',async()=>{
 const device=memoryDevice(),db=memoryProjects(),c=context({},device,db),session=createMatchingSession(c);
 await session.restore();
 db.transaction=async()=>{throw Error('editable projects must not use generic mutations');};
 await session.importProject({...work,isDraft:true,title:'有层级的手帐'});
 assert.deepEqual(db.writes,['p']);
 const variant={id:'generated',status:'completed',project:{...work,id:'new-id',isDraft:false},linkedProjectID:null};
 await device.put('test-user',matchingSnapshot({},[variant]));
 const other=context({},device,db),otherSession=createMatchingSession(other);
 await otherSession.restore();await otherSession.open('generated');
 assert.equal(db.writes.length,2);
 assert.notEqual(db.writes[1],'p');
 assert.equal(other.state.projects.length,1);
});

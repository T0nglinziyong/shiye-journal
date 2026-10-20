import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudStore} from '../src/cloud-store.js';
import {projectBlobText} from '../src/project-document.js';
import {projectSemanticFingerprint} from '../src/project-semantic.js';
// All successfully staged project fixtures use the current-only persisted
// Scene v2 tree. The malformed-outbox tests intentionally bypass this helper.
function v2(record){
 if(!record?.drafts)return record;
 return {...record,drafts:record.drafts.map(d=>{
  if(d.sceneVersion===2)return d;
  const {items=[],textBlocks=[],primitives=[],strokes=[],...rest}=d;
  const defaults=(n,i)=>({id:n.id||'test-'+i,x:n.x??50,y:n.y??60,width:n.width??30,height:n.height??30,zIndex:n.zIndex??i});
  const layers=[
   ...items.map((n,i)=>({...defaults(n,i),...n,assetID:n.assetID||'fixture-paper',type:'material'})),
   ...textBlocks.map((n,i)=>({...defaults(n,i),color:'#224466',fontSize:24,...n,type:'text'})),
   ...primitives.map((n,i)=>({...defaults(n,i),...n,type:'shape'})),
   ...strokes.map((n,i)=>({...n,id:n.id||'ink-'+i,type:'ink',color:n.color||'#334455',width:n.width||2,points:n.points||[{x:1,y:2}]}))
  ];
  return {...rest,sceneVersion:2,layers};
 })};
}


function fixture(cache=null,objectStorage=null,projectPreview=()=>null){
  const state={revision:0,accountEpoch:'epoch-fixture',rows:[],calls:[],commits:new Map(),receipts:new Map(),receiptReads:[],keyVersions:new Map(),fail:false,authError:false,uploads:[],downloads:0};
  const client={from(table){
    const filters={};const query={select(){return query;},eq(k,v){filters[k]=v;return query;},in(k,v){filters[k]=v;return query;},limit(){return query;},abortSignal(){return query;},order(){return query;},
      then(resolve){state.batchReads=(state.batchReads||0)+1;
        if(table==='shiye_commit_receipts_v3'||table==='shiye_commits'){
          state.receiptReads.push(table);
          const source=table==='shiye_commit_receipts_v3'?state.receipts:state.commits;
          return Promise.resolve(resolve({data:[...source.keys()]
            .filter(id=>filters.operation_id.includes(id)).map(operation_id=>({operation_id}))}));
        }
        const rows=filters.store==='blobs'&&Array.isArray(filters.id)?(state.cloudCopies||state.rows.map(record=>({id:record.id,record}))):(state.cloudCopies||[]);return Promise.resolve(resolve({data:rows.filter(row=>!filters.id||(Array.isArray(filters.id)?filters.id.includes(row.id):row.id===filters.id))}));},
      async range(start,end){state.reads=(state.reads||0)+1;const rows=state.rows.slice(start,end+1).map(record=>({record:v2(record)}));await state.onReadPage?.(start,end);return {data:rows};},
      async single(){state.versionReads=(state.versionReads||0)+1;return {data:{revision:state.revision,account_epoch:state.accountEpoch}};},
      async maybeSingle(){if(table==='shiye_commits'||table==='shiye_commit_receipts_v3')state.receiptReads.push(table);
        return {data:table==='shiye_commits'?(state.commits.has(filters.operation_id)?{revision:state.commits.get(filters.operation_id)}:null):table==='shiye_commit_receipts_v3'?(state.receipts.get(filters.operation_id)||null):state.rows.filter(r=>r.id===filters.id).map(record=>({record:v2(record)}))[0]||null};}};
    if(table==='shiye_changes')return {select(){return this;},eq(){return this;},gt(){return this;},lte(){return this;},order(){return this;},async range(){return state.changes?{data:state.changes}:{error:{message:'change log not installed'}};}};
    assert.ok(['shiye_records','shiye_revisions','shiye_commits','shiye_commit_receipts_v3'].includes(table));return query;
  },
    async rpc(name,args){
      assert.equal(name,'shiye_commit_v3_guarded');state.calls.push(args);
      if(state.rpcAbort)throw new DOMException('request aborted','AbortError');
      if(state.rpcFailure)return state.rpcFailure;
      const receipt=revision=>({status:'applied',revision,accountEpoch:state.accountEpoch,syncProtocolVersion:3});
      if(state.commits.has(args.operation_id))return state.loseAck?{error:{message:'network response lost'}}:{data:receipt(state.commits.get(args.operation_id))};
      const stale=args.base_revision<state.revision;
      const changed=stale&&args.operations.some(op=>{
        if(op.action==='clear')return true;
        const id=op.item?.id??op.id;
        if((state.keyVersions.get(op.store+':'+id)||0)>args.base_revision)return true;
        if(Array.isArray(state.changes))return state.changes.some(row=>row.revision>args.base_revision&&
          row.keys.some(key=>key.store===op.store&&(key.action==='clear'||key.id===id)));
        return state.rows.some(row=>row.id===id);
      });
      if(state.fail||args.base_revision>state.revision||changed||args.expected_epoch!==state.accountEpoch)
        return {error:{message:'conflict',code:'40001'}};
      const revision=++state.revision;state.commits.set(args.operation_id,revision);
      state.receipts.set(args.operation_id,{result:receipt(revision)});
      for(const op of args.operations)state.keyVersions.set(op.store+':'+(op.item?.id??op.id??'*'),revision);
      if(state.loseAck)return {error:{message:'network response lost'}};
      return {data:receipt(revision)};
    }
  };
  // A CloudBase-only fixture uses COS as its sole remote object store.
  // Keep the same state counters for the cache/retry assertions below.
  const cos=objectStorage||{enabled:true,
    async upload(path,data,type){state.uploads.push({path,data,options:{upsert:false,contentType:type}});
      await state.uploadGate;if(state.fail)throw Error('图片上传失败，未保存元数据');},
    async download(path){state.downloads++;
      if(state.missingThumbnail&&path.includes('preview480'))throw Error('COS 404');
      return state.uploads.find(row=>row.path===path)?.data||new Blob(['private image']);},
    async preview(path){state.downloads++;return new Blob(['private image'],{type:'image/webp'});},
    async probe(){return true;}
  };
  const db=createCloudStore({cache,objectStorage:cos,projectPreview,cloudClient:()=>client,requireCloudUser:async()=>{if(state.authError)throw Error('not authorized');return {id:'owner-uuid'};}});
  return {state,db};
}
test('cloud reads all pages, not just the server default first 1000 records',async()=>{
  const {state,db}=fixture();state.rows=Array.from({length:1001},(_,i)=>({id:String(i)}));
  assert.equal((await db.cloudAll('assets')).length,1001);
});
test('queue rebuild batches receipt checks and retains unconfirmed local changes',async()=>{
  const cache=memoryCache(),{state,db}=fixture(cache);
  await db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').put({id:'already',title:'已到云端'}));
  await db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').put({id:'waiting',title:'待重传'}));
  const original=await activeRows(cache,'batch');
  state.receipts.set(original[0].operationID,{result:{revision:1}});
  state.revision=1;
  const result=await db.cloudRebuildPending({assets:[{id:'waiting',title:'当前本机标题'}]});
  const remaining=await activeRows(cache,'batch');
  assert.deepEqual(result,{replaced:2,pending:1});
  assert.equal(remaining.length,1);
  assert.equal(remaining[0].record.operations[0].item.title,'当前本机标题');
  assert.deepEqual(state.receiptReads,['shiye_commit_receipts_v3','shiye_commits']);
});
test('account reset entry is callable and an unaccepted reset restores cloud writes',async()=>{
  const {db,state}=fixture();
  await assert.rejects(db.cloudRunExclusiveReset(async()=>{throw Error('probe failed');}),/probe failed/);
  db.cloudAbortExclusiveReset();
  await db.cloudTransaction(['assets'],tx=>tx.objectStore('assets').put({id:'after-failed-reset'}));
  assert.equal(state.revision,1);
});
test('a changed account epoch prevents an old session from uploading its local edits',async()=>{
  const {state,db}=fixture(memoryCache());
  await db.cloudAll('assets');
  state.accountEpoch='new-epoch';state.revision++;
  await assert.rejects(db.cloudRefresh(),/账号资料已重新开始/);
  assert.equal(state.calls.length,0);
});
test('an old pending edit is retained after account reset instead of silently acknowledged',async()=>{
  const cache=memoryCache(),{state,db}=fixture(cache);
  await db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').put({id:'protected-draft'}));
  state.revision=2;state.accountEpoch='new-epoch';
  state.rows=[{id:'shiye-reset-barrier',revision:2,phase:'deleting'}];
  await assert.rejects(db.cloudFlushProjects(),/账号已清空|conflict/);
  assert.equal((await activeRows(cache,'batch')).length,1);
});
test('large collection reads independent pages concurrently after the first page',async()=>{
  const {state,db}=fixture();state.rows=Array.from({length:1001},(_,i)=>({id:String(i)}));
  const started=[];let release;
  const gate=new Promise(resolve=>{release=resolve;});
  state.onReadPage=async start=>{if(start>=500){started.push(start);if(started.length===2)release();await gate;}};
  assert.equal((await db.cloudAll('projects')).length,1001);
  assert.deepEqual(started,[500,1000]);
});
test('cold collection reads share one revision request',async()=>{
  const {state,db}=fixture();
  await Promise.all(['assets','series','projects','trash','meta'].map(store=>db.cloudAll(store)));
  assert.equal(state.versionReads,6,'one startup revision plus one verification per collection');
});
test('a read-only cloud tab subscribes to committed changes before its first write',async()=>{
  const priorWindow=globalThis.window,priorChannel=globalThis.BroadcastChannel,names=[];
  globalThis.window={dispatchEvent(){}};
  globalThis.BroadcastChannel=class{constructor(name){names.push(name);}postMessage(){}close(){}};
  try{
    const {db}=fixture();
    await db.cloudAll('assets');
    assert.deepEqual(names,['shiye-outbox:cloud:owner-uuid']);
  }finally{
    if(priorWindow===undefined)delete globalThis.window;else globalThis.window=priorWindow;
    if(priorChannel===undefined)delete globalThis.BroadcastChannel;else globalThis.BroadcastChannel=priorChannel;
  }
});
test('direct cloud uploads also appear in the global sync indicator until committed',async()=>{
  const events=[],previous=globalThis.window;globalThis.window={dispatchEvent:event=>events.push(event.detail)};
  try{const {db}=fixture();await db.cloudTransaction(['blobs'],tx=>tx.objectStore('blobs').put({id:'direct',data:new Blob(['bytes'])}));
    assert.ok(events.some(event=>event.pending>0));assert.equal(events.at(-1).pending,0);
  }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
test('sync diagnostic export reports a failed phase without record content',async()=>{
  const {state,db}=fixture();state.fail=true;
  await db.cloudAll('assets');
  await assert.rejects(db.cloudTransaction(['assets'],tx=>tx.objectStore('assets').put({id:'secret-id',title:'私人标题'})));
  const report=db.cloudSyncDiagnosticReport({online:true});
  assert.equal(report.format,'shiye-sync-diagnostics');
  assert.equal(report.lastFailure.failure.phase,'云端提交事务');
  assert.equal(report.lastFailure.failure.category,'revision-conflict');
  assert.equal(report.state.online,true);
  assert.doesNotMatch(JSON.stringify(report),/secret-id|私人标题|owner-uuid/);
});
test('database HTTP status and SQLSTATE survive a rejected commit in diagnostics',async()=>{
  const {state,db}=fixture();
  state.rpcFailure={data:null,status:504,error:{code:'57014',message:'private SQL text'}};
  await assert.rejects(db.cloudTransaction(['assets'],tx=>
    tx.objectStore('assets').put({id:'private-id',title:'私人标题'})));
  const failure=db.cloudSyncDiagnosticReport().lastFailure.failure;
  assert.equal(failure.category,'database-timeout');
  assert.equal(failure.status,504);
  assert.equal(failure.code,'57014');
  assert.ok(Number.isInteger(failure.rpcDurationMs));
  assert.doesNotMatch(JSON.stringify(db.cloudSyncDiagnosticReport()),/private-id|私人标题|private SQL text/);
});
test('imports finish durable staging while image uploads are blocked; pending bytes survive reopening',async()=>{
  const cache=memoryCache(),a=fixture(cache);let release;a.state.uploadGate=new Promise(r=>release=r);
  await a.db.cloudAll('assets');
  const batch={assets:[{id:'new',blobId:'img'}],blobs:[{id:'img',data:new Blob(['pending-original'])}],projects:[]};
  assert.deepEqual(await a.db.cloudStageImport(batch),{pending:true});assert.equal(a.state.calls.length,0);
  assert.equal((await a.db.cloudAll('assets'))[0].id,'new');assert.equal(await (await a.db.cloudGet('blobs','img')).data.text(),'pending-original');
  const reopened=fixture(cache);assert.equal((await reopened.db.cloudAll('assets'))[0].id,'new');assert.equal(await (await reopened.db.cloudPreview('img')).text(),'pending-original');assert.equal(reopened.state.downloads,0);
  release();await a.db.cloudFlushProjects();assert.equal(a.state.calls.length,1);assert.equal(a.state.calls[0].operations.length,2);
  assert.deepEqual(await activeRows(cache,'batch'),[]);
});
test('logout summary reads the shared account outbox without waiting for upload',async()=>{
  const cache=memoryCache(),first=fixture(cache);let release;
  first.state.uploadGate=new Promise(resolve=>release=resolve);
  await first.db.cloudStageImport({assets:[{id:'a',blobId:'image'}],blobs:[{id:'image',data:new Blob(['bytes'])}],projects:[]});
  assert.deepEqual(await first.db.cloudPendingLocalSummary(),{projects:0,imports:1,quarantined:0});
  const second=fixture(cache);
  assert.deepEqual(await second.db.cloudPendingLocalSummary(),{projects:0,imports:1,quarantined:0});
  release();await first.db.cloudFlushProjects();
});
test('failed import uploads retain the entire batch; rejected auth/quota never creates a ghost import',async()=>{
  const cache=memoryCache(),a=fixture(cache);a.state.fail=true;
  await a.db.cloudStageImport({assets:[{id:'a'}],blobs:[{id:'b',data:new Blob(['image'])}],projects:[]});await assert.rejects(a.db.cloudFlushProjects(),/图片上传失败|未获确认/);
  assert.equal((await activeRows(cache,'batch')).length,1);assert.equal(a.state.calls.length,0);
  const reopened=fixture(cache);reopened.state.authError=true;await assert.rejects(reopened.db.cloudGet('blobs','b'),/not authorized/);
  const durable=memoryCache();let full=true;
  const quota=fixture({...durable,put:async(...args)=>{if(full)throw Error('quota');return durable.put(...args);}});
  await assert.rejects(quota.db.cloudStageImport({assets:[{id:'ghost'}]}),/quota/);
  full=false;assert.deepEqual(await quota.db.cloudAll('assets'),[]);assert.equal(quota.state.calls.length,0);
});
test('one import upload failure does not block a separate import',async()=>{
  const cache=memoryCache(),uploaded=[];
  let fail=true;
  const objectStorage={enabled:true,async upload(path,blob){
    uploaded.push(path);
    if(fail&&await blob.text()==='broken-bytes')throw Error('COS upload failed');
  }};
  const {db,state}=fixture(cache,objectStorage);
  await db.cloudStageImport({assets:[{id:'broken',blobId:'broken-image'}],
    blobs:[{id:'broken-image',data:new Blob(['broken-bytes'])}],projects:[]});
  await db.cloudStageImport({assets:[{id:'safe',blobId:'safe-image'}],
    blobs:[{id:'safe-image',data:new Blob(['safe-bytes'])}],projects:[]});
  await assert.rejects(db.cloudFlushProjects(),/未获确认|图片上传失败|COS upload failed/);
  assert.equal(state.calls.length,1,'the independent import reaches metadata commit');
  assert.deepEqual(state.calls[0].operations.filter(op=>op.store==='assets').map(op=>op.item.id),['safe']);
  assert.equal((await activeRows(cache,'batch')).length,1,'failed import stays durable');
  fail=false;
  await db.cloudFlushProjects();
  assert.equal(state.calls.length,2);
  assert.deepEqual(await activeRows(cache,'batch'),[]);
  assert.ok(uploaded.length>=2);
});

test('one failed material does not block siblings from the same recognition batch',async()=>{
  const cache=memoryCache();let fail=true;
  const objectStorage={enabled:true,async upload(path,blob){
    if(fail&&await blob.text()==='broken-bytes')throw Error('COS upload failed');
  }};
  const {db,state}=fixture(cache,objectStorage);
  await db.cloudStageImport({assets:[
    {id:'broken',blobId:'broken-image'},
    {id:'safe',blobId:'safe-image'}
  ],blobs:[
    {id:'broken-image',data:new Blob(['broken-bytes'])},
    {id:'safe-image',data:new Blob(['safe-bytes'])}
  ],projects:[]});
  await assert.rejects(db.cloudFlushProjects(),/未获确认|图片上传失败|COS upload failed/);
  assert.equal(state.calls.length,1);
  assert.deepEqual(state.calls[0].operations.filter(op=>op.store==='assets').map(op=>op.item.id),['safe']);
  assert.equal((await activeRows(cache,'batch')).length,1);
  fail=false;await db.cloudFlushProjects();
  assert.equal(state.calls.length,2);
  assert.deepEqual(await activeRows(cache,'batch'),[]);
});

test('a wide material metadata save stages bounded commits without losing any edit',async()=>{
  const cache=memoryCache(),{state,db}=fixture(cache);
  await db.cloudStageMutation(['assets'],tx=>{
    for(let i=0;i<58;i++)tx.objectStore('assets').put({id:'bulk-'+i,title:'updated'});
  });
  assert.equal((await activeRows(cache,'batch')).length,8);
  await db.cloudFlushProjects();
  assert.equal(state.calls.length,8);
  assert.deepEqual(state.calls.flatMap(call=>call.operations.map(op=>op.item.id)),
    Array.from({length:58},(_,i)=>'bulk-'+i));
  assert.deepEqual(await activeRows(cache,'batch'),[]);
});

test('opening the app converts an older multi-material outbox into independent rows',async()=>{
  const cache=memoryCache();
  cache.repairUnifiedOutbox=async(owner,_previous,next,held)=>{
    await cache.put(owner,'unified-outbox',next);
    const quarantine=[...(await cache.get(owner,'sync-quarantine')||[]),...held];
    await cache.put(owner,'sync-quarantine',quarantine);
    return {rows:next,quarantine};
  };
  const payload={id:'old-import',assets:[{id:'a',blobId:'a'},{id:'b',blobId:'b'}],
    blobs:[{id:'a',data:new Blob(['asset-a'])},{id:'b',data:new Blob(['asset-b'])}],projects:[]};
  await cache.put('cloud:owner-uuid','unified-outbox',[{
    record:{id:'batch:old-import',kind:'batch',payload},serial:1,baseRevision:0,
    operationID:'old-import-operation',attempt:4,lastFailureClass:'transient'
  }]);
  const {db}=fixture(cache);
  const pending=await db.cloudPendingDetails();
  assert.equal(pending.batches.length,2);
  assert.deepEqual(pending.batches.map(batch=>batch.items.find(item=>item.store==='assets').id).sort(),['a','b']);
  assert.equal((await cache.get('cloud:owner-uuid','sync-quarantine')).length,0);
});

test('trash restore survives AbortError: local stage is immediate and reopen retries the same operation',async()=>{
  const cache=memoryCache(),first=fixture(cache);first.state.rpcAbort=true;
  await first.db.cloudStageMutation(['trash','assets'],tx=>{tx.objectStore('trash').delete('t');tx.objectStore('assets').put({id:'restored',title:'safe'});});
  assert.deepEqual((await first.db.cloudAll('assets')).map(row=>row.id),['restored']);
  await assert.rejects(first.db.cloudFlushProjects(),/未获确认/);
  assert.equal((await activeRows(cache,'batch')).length,1);
  const reopened=fixture(cache);await reopened.db.cloudFlushProjects();
  assert.deepEqual(await activeRows(cache,'batch'),[]);
  assert.deepEqual(reopened.state.calls[0].operations.map(op=>op.store+':'+op.action),['trash:delete','assets:put']);
});
test('aborted delete resumes after unrelated edits and a newer same-record edit wins automatically',async()=>{
  const cache=memoryCache(),first=fixture(cache);first.state.rpcAbort=true;
  await first.db.cloudStageMutation(['trash'],tx=>tx.objectStore('trash').delete('mine'));
  await assert.rejects(first.db.cloudFlushProjects(),/未获确认/);
  first.state.rpcAbort=false;first.state.revision=1;
  first.state.changes=[{revision:1,keys:[{store:'assets',action:'put',id:'other'}]}];
  await first.db.cloudFlushProjects();
  assert.equal(first.state.calls.at(-1).base_revision,0);
  assert.deepEqual(await activeRows(cache,'batch'),[]);

  const secondCache=memoryCache(),second=fixture(secondCache);second.state.rpcAbort=true;
  await second.db.cloudStageMutation(['trash'],tx=>tx.objectStore('trash').delete('mine'));
  await assert.rejects(second.db.cloudFlushProjects(),/未获确认/);
  second.state.rpcAbort=false;second.state.revision=1;
  second.state.changes=[{revision:1,keys:[{store:'trash',action:'put',id:'mine'}]}];
  await second.db.cloudFlushProjects();
  assert.equal((await activeRows(secondCache,'batch')).length,0);
});
test('a stale asset metadata save cannot revive a newer cloud tombstone',async()=>{
  const cache=memoryCache(),{db,state}=fixture(cache);
  await db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').put({id:'gone',title:'old edit'}));
  state.revision=1;
  state.rows=[{id:'tombstone:assets:gone',kind:'tombstone',store:'assets',targetID:'gone'}];
  state.changes=[{revision:1,keys:[{store:'assets',action:'delete',id:'gone'},
    {store:'meta',action:'put',id:'tombstone:assets:gone'}]}];
  await db.cloudFlushProjects();
  assert.deepEqual(await activeRows(cache,'batch'),[]);
  assert.equal(state.calls.length,1,'the old write is rejected before the tombstone is accepted');
});
test('aborted work edit resumes across an unrelated cloud revision without overwriting it',async()=>{
  const cache=memoryCache(),first=fixture(cache);first.state.rpcAbort=true;
  const work={id:'my-work',title:'locally edited',activeDraftID:'d',drafts:[{id:'d',canvas:{width:700,height:1000},items:[],textBlocks:[],primitives:[],strokes:[]}]};
  await first.db.cloudStageProject(v2(work));
  await assert.rejects(first.db.cloudFlushProjects(),/未获确认/);
  first.state.rpcAbort=false;first.state.revision=1;
  first.state.changes=[{revision:1,keys:[{store:'assets',action:'put',id:'other'}]}];
  await first.db.cloudFlushProjects();
  assert.equal(first.state.calls.at(-1).base_revision,0);
  assert.deepEqual(await activeRows(cache,'project'),[]);
});
test('D-01: background cursor advance cannot relabel a stale opened work as the new document version',async()=>{
  const cache=memoryCache(),{state,db}=fixture(cache);
  const saved=v2({id:'diary',title:'远端 v1',activeDraftID:'d',drafts:[{id:'d',canvas:{width:700,height:1000},items:[],textBlocks:[{id:'text',content:'正文 v1'}],primitives:[],strokes:[]}]});
  state.revision=1;state.rows=[saved];
  const opened=(await db.cloudAll('projects'))[0];
  assert.equal(opened.__cloudBaseRevision,1);
  state.revision=2;state.rows=[{...saved,drafts:[{...saved.drafts[0],layers:saved.drafts[0].layers.map(layer=>layer.id==='text'?{...layer,content:'另一设备的正文 v2'}:layer)}]}];
  state.changes=[{revision:2,keys:[{store:'projects',action:'put',id:'diary'}]}];
  await db.cloudRefresh();
  await db.cloudStageProject({...opened,title:'本机改标题'});
  const pending=await db.cloudPendingProjects();
  assert.equal(pending[0].baseRevision,1);
  await db.cloudFlushProjects();
  assert.equal((await cache.get('cloud:owner-uuid','pre-conflict-scene-index')).length,1,
    'both versions are backed up before conflict handling');
  assert.equal(state.calls.length,2,'the first server CAS rejects the stale document before metadata reconciliation');
  assert.equal(state.calls.at(-1).operations[0].item.title,'本机改标题');
  assert.equal(state.calls.at(-1).operations[0].item.drafts[0].layers.find(layer=>layer.id==='text').content,'另一设备的正文 v2');
  assert.equal((await db.cloudPendingProjects()).length,0);
});
test('D-02: a stale work can rebase only over a complete disjoint change log',async()=>{
  const cache=memoryCache(),{state,db}=fixture(cache);
  const saved=v2({id:'diary',title:'远端 v1',activeDraftID:'d',drafts:[{id:'d',canvas:{width:700,height:1000},items:[],textBlocks:[],primitives:[],strokes:[]}]});
  state.revision=1;state.rows=[saved];const opened=(await db.cloudAll('projects'))[0];
  state.revision=2;state.changes=[{revision:2,keys:[{store:'assets',action:'put',id:'other'}]}];
  await db.cloudRefresh();
  await db.cloudStageProject({...opened,title:'本机改标题'});
  await db.cloudFlushProjects();
  assert.equal(state.calls[0].base_revision,1);
  assert.deepEqual(await db.cloudPendingProjects(),[]);
});
test('D-03: an untagged known work cannot claim the newest cursor and keeps a separate copy',async()=>{
  const cache=memoryCache(),{state,db}=fixture(cache);
  const saved=v2({id:'diary',title:'旧作品',activeDraftID:'d',drafts:[{id:'d',canvas:{width:700,height:1000},items:[],textBlocks:[],primitives:[],strokes:[]}]});
  state.revision=4;state.rows=[saved];await db.cloudAll('projects');
  await db.cloudStageProject({...v2(saved),title:'本机新标题'});
  assert.equal((await db.cloudPendingProjects())[0].baseRevision,0);
  await db.cloudFlushProjects();
  assert.equal((await cache.get('cloud:owner-uuid','pre-conflict-scene-index')).length,1);
  assert.equal(state.calls.length,2);
  assert.equal(state.calls.at(-1).operations[0].item.title,'本机新标题 · 另一编辑版本');
  assert.notEqual(state.calls.at(-1).operations[0].item.id,'diary');
  assert.equal((await db.cloudPendingProjects()).length,0);
});
test('D-04: confirmed edits advance only their own editor session for a second save',async()=>{
  const {state,db}=fixture(memoryCache());
  const saved=v2({id:'diary',title:'初始',activeDraftID:'d',drafts:[{id:'d',canvas:{width:700,height:1000},items:[],textBlocks:[],primitives:[],strokes:[]}]});
  state.revision=1;state.rows=[saved];const opened=(await db.cloudAll('projects'))[0];
  opened.title='第一次';await db.cloudStageProject(opened);await db.cloudFlushProjects();
  opened.title='第二次';await db.cloudStageProject(opened);await db.cloudFlushProjects();
  assert.deepEqual(state.calls.map(call=>call.base_revision),[1,2]);
  assert.deepEqual(await db.cloudPendingProjects(),[]);
  assert.equal(state.calls[1].operations[0].item.__cloudSessionId,undefined);
});
test('reopening after partial import metadata reuploads original bytes without manual conflict',async()=>{
  const cache=memoryCache();
  await cache.put('cloud:owner-uuid','unified-outbox',[{
    record:{id:'batch:old-import',kind:'batch',payload:{id:'old-import',
      assets:[{id:'new-asset',blobId:'new-blob'}],
      blobs:[{id:'new-blob',data:new Blob(['image'])}],projects:[]}},
    serial:1,baseRevision:0,operationID:'old-import-op'
  }]);
  const reopened=fixture(cache);reopened.state.revision=1;reopened.state.rows=[{id:'new-asset',blobId:'new-blob'},{id:'new-blob',storagePath:'owner-uuid/hash',storageProvider:'cloudbase'}];
  await reopened.db.cloudFlushProjects();
  assert.equal(reopened.state.calls.length,2);
  assert.deepEqual(reopened.state.calls.at(-1).operations.map(op=>op.store),['blobs']);
  assert.ok(reopened.state.uploads.length>0,'metadata alone cannot prove the original bytes were uploaded');
  assert.deepEqual(await activeRows(cache,'batch'),[]);
});
test('lost acknowledgement for a material edit is recognized immediately and again after reopening',async()=>{
  const cache=memoryCache(),first=fixture(cache);first.state.loseAck=true;
  await first.db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').put({id:'asset',title:'renamed'}));
  await first.db.cloudFlushProjects();
  assert.deepEqual(await activeRows(cache,'batch'),[]);
  assert.deepEqual(first.state.receiptReads,['shiye_commit_receipts_v3'],
    'a lost v3 response is confirmed without a legacy receipt request');
  const operationID=first.state.calls[0].operation_id;
  await cache.put('cloud:owner-uuid','import-outbox',[{record:{id:'edit',names:['assets'],operations:[{action:'put',store:'assets',item:{id:'asset',title:'renamed'}}]},serial:1,baseRevision:0,operationID}]);
  const reopened=fixture(cache);reopened.state.revision=first.state.revision;reopened.state.commits=first.state.commits;
  await reopened.db.cloudFlushProjects();
  assert.equal(reopened.state.calls.length,0,'an acknowledged edit must never be replayed');
  assert.deepEqual(await activeRows(cache,'batch'),[]);
});
test('lost acknowledgement for a project snapshot restores the saved cloud version without a stuck outbox',async()=>{
  const cache=memoryCache(),first=fixture(cache);first.state.loseAck=true;
  const work={id:'work',title:'saved',activeDraftID:'d',drafts:[{id:'d',canvas:{width:700,height:1000},items:[],textBlocks:[],primitives:[],strokes:[]}]};
  await first.db.cloudStageProject(v2(work));
  await first.db.cloudFlushProjects();
  const operationID=first.state.calls[0].operation_id;
  await cache.put('cloud:owner-uuid','project-outbox',[{record:v2(work),serial:1,baseRevision:0,operationID}]);
  const reopened=fixture(cache);reopened.state.revision=first.state.revision;reopened.state.commits=first.state.commits;reopened.state.rows=[work];
  await reopened.db.cloudFlushProjects();
  assert.equal(reopened.state.calls.length,0);assert.deepEqual(await activeRows(cache,'project'),[]);
  assert.equal((await reopened.db.cloudAll('projects'))[0].title,'saved');
});
test('reopening an unfinished import after an unrelated remote update resumes upload',async()=>{
  const cache=memoryCache(),first=fixture(cache);first.state.uploadGate=new Promise(()=>{});
  await first.db.cloudStageImport({assets:[{id:'retry-asset',blobId:'retry-blob'}],blobs:[{id:'retry-blob',data:new Blob(['image'])}],projects:[]});
  const reopened=fixture(cache);reopened.state.revision=1;reopened.state.rows=[{id:'other-device',title:'unrelated'}];
  await reopened.db.cloudFlushProjects();assert.equal(reopened.state.calls.length,1);
  assert.equal(reopened.state.calls[0].base_revision,0);assert.deepEqual(await activeRows(cache,'batch'),[]);
});
test('reopening removes only an unrecoverable local import card, not a recoverable neighbor',async()=>{
  const cache=memoryCache(),a=fixture(cache);a.state.uploadGate=new Promise(()=>{});
  await a.db.cloudStageImport({assets:[{id:'lost',blobId:'empty'},{id:'safe',blobId:'valid'}],blobs:[{id:'empty',data:new Blob([])},{id:'valid',data:new Blob(['safe image'])}],projects:[]});
  const reopened=fixture(cache);const cards=await reopened.db.cloudAll('assets');
  assert.deepEqual(cards.map(card=>card.id),['safe']);
  const staged=(await activeRows(cache,'batch'))[0].record;
  assert.deepEqual(staged.assets.map(card=>card.id),['safe']);
  assert.deepEqual(staged.blobs.map(blob=>blob.id),['valid']);
});
test('remote metadata without a COS object does not keep a broken import card',async()=>{
  const cache=memoryCache(),first=fixture(cache);first.state.uploadGate=new Promise(()=>{});
  await first.db.cloudStageImport({assets:[{id:'ghost',blobId:'ghost-image'}],blobs:[{id:'ghost-image',data:new Blob([])}],projects:[]});
  const cos={enabled:true,probe:async()=>false};const reopened=fixture(cache,cos);
  reopened.state.cloudCopies=[{id:'ghost-image',record:{storagePath:'owner-uuid/'+'a'.repeat(64),storageProvider:'cloudbase'}}];
  assert.deepEqual(await reopened.db.cloudAll('assets'),[]);
  assert.deepEqual(await activeRows(cache,'batch'),[]);
});
test('confirmed remote COS object preserves a missing local import image',async()=>{
  const cache=memoryCache(),first=fixture(cache);first.state.uploadGate=new Promise(()=>{});
  await first.db.cloudStageImport({assets:[{id:'recoverable',blobId:'image'}],blobs:[{id:'image',data:new Blob([])}],projects:[]});
  const cos={enabled:true,probe:async()=>true};const reopened=fixture(cache,cos);
  reopened.state.cloudCopies=[{id:'image',record:{storagePath:'owner-uuid/'+'a'.repeat(64),storageProvider:'cloudbase'}}];
  assert.equal((await reopened.db.cloudAll('assets'))[0].id,'recoverable');
});
test('cloud objects require explicit current storage provider metadata',async()=>{
  const files=new Map(),cos={enabled:true,async upload(path,blob){files.set(path,blob);},async download(path){if(!files.has(path))throw Error('COS offline');return files.get(path);}},a=fixture(null,cos);
  await a.db.cloudTransaction(['blobs'],tx=>tx.objectStore('blobs').put({id:'cos-image',data:new Blob(['COS bytes'])}));const record=a.state.calls[0].operations[0].item;
  assert.equal(record.storageProvider,'cloudbase');assert.equal(a.state.uploads.length,0);
  const b=fixture(null,cos);b.state.rows=[record];assert.equal(await (await b.db.cloudGet('blobs','cos-image')).data.text(),'COS bytes');assert.equal(b.state.downloads,0);
  const deniedProvider=fixture(null,cos);
   deniedProvider.state.rows=[{id:'unsupported',storagePath:'owner-uuid/current',storageProvider:'unknown-old-provider'}];
   await assert.rejects(deniedProvider.db.cloudGet('blobs','unsupported'),/尚未迁移/);
   assert.equal(deniedProvider.state.downloads,0);
  const invalid=fixture(null,cos);invalid.state.rows=[{id:'missing-provider',storagePath:'owner-uuid/current'}];await assert.rejects(invalid.db.cloudGet('blobs','missing-provider'),/尚未迁移/);
  files.clear();const failed=fixture(null,cos);failed.state.rows=[record];await assert.rejects(failed.db.cloudGet('blobs','cos-image'),/COS offline/);assert.equal(failed.state.downloads,0);
});
test('COS metadata waits for the original without decoding an eager preview',async()=>{
  const oldBitmap=globalThis.createImageBitmap,oldDocument=globalThis.document;
  globalThis.createImageBitmap=async()=>({width:480,height:480,close(){}});
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toBlob:callback=>callback(new Blob(['preview'],{type:'image/webp'}))})};
  try{
    let releaseOriginal;const gate=new Promise(resolve=>releaseOriginal=resolve),started=[];
    const cos={enabled:true,async upload(path){started.push(path);if(!path.endsWith('-preview480.webp'))await gate;}};
    const {state,db}=fixture(null,cos);const commit=db.cloudTransaction(['blobs'],tx=>tx.objectStore('blobs').put({id:'parallel',data:new Blob(['original'],{type:'image/png'})}));
    for(let i=0;i<100&&started.length<1;i++)await new Promise(resolve=>setTimeout(resolve,1));
    assert.equal(started.length,1);assert.equal(state.calls.length,0,'cloud metadata must not precede the original');
    releaseOriginal();await commit;assert.equal(state.calls.length,1);
  }finally{if(oldBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=oldBitmap;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
test('a slow COS preview does not delay the original metadata commit',async()=>{
  const oldBitmap=globalThis.createImageBitmap,oldDocument=globalThis.document;
  globalThis.createImageBitmap=async()=>({width:480,height:480,close(){}});
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),
    toBlob:callback=>callback(new Blob(['preview'],{type:'image/webp'}))})};
  let releasePreview;const previewGate=new Promise(resolve=>releasePreview=resolve);
  try{
    const cos={enabled:true,async upload(path){if(path.endsWith('-preview480.webp'))await previewGate;}};
    const {state,db}=fixture(null,cos);
    await db.cloudTransaction(['blobs'],tx=>tx.objectStore('blobs').put({
      id:'nonblocking-preview',data:new Blob(['original'],{type:'image/png'})}));
    assert.equal(state.calls.length,1);
    assert.equal(state.calls[0].operations[0].item.thumbnailPath,undefined);
  }finally{
    releasePreview();
    if(oldBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=oldBitmap;
    if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  }
});
test('staged material bytes upload before acquiring the account revision lock',async()=>{
  const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const events=[];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{
    request:async(_name,_options,callback)=>{events.push('lock');return callback();}
  }}});
  try{
    const cos={enabled:true,async upload(path){events.push('upload:'+path);}};
    const {state,db}=fixture(memoryCache(),cos);
    await db.cloudStageImport({assets:[{id:'material',blobId:'cutout'}],
      blobs:[{id:'cutout',data:new Blob(['visible pixels'],{type:'image/png'})}],projects:[]});
    await db.cloudFlushProjects();
    assert.ok(events[0].startsWith('upload:'),'independent object transfer precedes account lock');
    assert.equal(events.filter(event=>event.startsWith('upload:')).length,1,'commit reuses the prepared immutable blob');
    assert.equal(events.filter(event=>event==='lock').length,1);
    assert.equal(state.calls.length,1,'the versioned metadata transaction still commits once');
  }finally{
    if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);
    else delete globalThis.navigator;
  }
});
test('a COS import uploads each original once and defers cover processing',async()=>{
  const oldBitmap=globalThis.createImageBitmap,oldDocument=globalThis.document;
  let decoded=0;
  globalThis.createImageBitmap=async()=>{decoded++;return {width:480,height:480,close(){}};};
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toBlob:callback=>callback(new Blob(['preview'],{type:'image/webp'}))})};
  try{
    const paths=[],cos={enabled:true,async upload(path){paths.push(path);}};
    const {state,db}=fixture(null,cos);
    await db.cloudTransaction(['assets','blobs','projects'],tx=>{
      tx.objectStore('assets').put({id:'material',blobId:'cutout',candidateFrameBlobId:'frame',
        initialMaskBlobId:'mask',finalMaskBlobId:'mask',photoBlobId:'photo'});
      tx.objectStore('projects').put({id:'work',originalImportPhotoBlobID:'photo'});
      for(const id of ['cutout','frame','mask','photo'])
        tx.objectStore('blobs').put({id,data:new Blob([id+'-pixels'],{type:'image/png'})});
    });
    assert.equal(paths.filter(path=>path.endsWith('-preview480.webp')).length,0);
    assert.equal(paths.length,4,'four original blobs without a main-thread preview pass');
    assert.equal(decoded,0,'no source image is decoded during the upload commit');
    const blobs=state.calls[0].operations.filter(op=>op.store==='blobs');
    assert.deepEqual(blobs.map(op=>!!op.item.thumbnailPath),[false,false,false,false]);
  }finally{
    if(oldBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=oldBitmap;
    if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  }
});
test('ordinary cutout updates and deletes are durable and immediately readable without waiting for uploads',async()=>{
  const cache=memoryCache(),a=fixture(cache);let release;a.state.uploadGate=new Promise(r=>release=r);await a.db.cloudAll('assets');
  await a.db.cloudStageMutation(['assets','blobs'],tx=>{tx.objectStore('assets').put({id:'a',title:'edited',blobId:'cut'});tx.objectStore('blobs').put({id:'cut',data:new Blob(['new-cutout'])});});
  assert.equal((await a.db.cloudGet('assets','a')).title,'edited');assert.equal(await (await a.db.cloudGet('blobs','cut')).data.text(),'new-cutout');assert.equal(a.state.calls.length,0);
  await a.db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').delete('a'));assert.equal(await a.db.cloudGet('assets','a'),undefined);assert.deepEqual(await a.db.cloudAll('assets'),[]);
  release();await a.db.cloudFlushProjects();assert.equal(a.state.calls.length,2);assert.equal(a.state.calls[1].operations[0].action,'delete');assert.deepEqual(await activeRows(cache,'batch'),[]);
});
test('deleting a pending imported asset hides it immediately even while its upload is blocked',async()=>{
  const cache=memoryCache(),first=fixture(cache);first.state.uploadGate=new Promise(()=>{});
  await first.db.cloudAll('assets');
  await first.db.cloudStageImport({assets:[{id:'pending',blobId:'pending-image'}],blobs:[{id:'pending-image',data:new Blob(['bytes'])}],projects:[]});
  await first.db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').delete('pending'));
  assert.deepEqual(await first.db.cloudAll('assets'),[]);
  const reopened=fixture(cache);assert.deepEqual(await reopened.db.cloudAll('assets'),[]);
});
test('damaged pending work falls back to its last saved cloud edit on reopen',async()=>{
  const cache=memoryCache(),saved={id:'work',title:'已保存的编辑',activeDraftID:'draft',drafts:[{id:'draft',canvas:{width:707,height:1000},items:[],textBlocks:[{id:'saved-text',content:'上次保存'}],primitives:[],strokes:[]}]};
  await cache.put('cloud:owner-uuid','project-outbox',[{record:{...saved,drafts:[{...saved.drafts[0],textBlocks:undefined}]},serial:1,baseRevision:0}]);
  const reopened=fixture(cache);reopened.state.rows=[saved];
  assert.deepEqual(await reopened.db.cloudPendingProjects(),[]);
  assert.equal((await reopened.db.cloudAll('projects'))[0].drafts[0].layers[0].content,'上次保存');
  assert.equal((await cache.get('cloud:owner-uuid','sync-quarantine')).length,1,'quarantined work must remain durably recoverable');
  await assert.rejects(reopened.db.cloudStageProject({...v2(saved),drafts:[]}),/不完整/);
});
// Only one physical queue is active; older keys are migration sources only.
async function activeRows(cache,kind){
 const rows=await cache.get('cloud:owner-uuid','unified-outbox')||[];
 return rows.filter(row=>row.record?.kind===kind).map(row=>({
   ...row,record:row.record.payload
 }));
}
function memoryCache(){const rows=new Map();return {async get(owner,key){return structuredClone(rows.get(owner+':'+key));},async put(owner,key,value){rows.set(owner+':'+key,structuredClone(value));},async clear(owner){for(const key of rows.keys())if(key.startsWith(owner+':'))rows.delete(key);}};}
test('uploaded originals are immediately reusable and survive a fresh cloud store without re-download',async()=>{
  const cache=memoryCache(),a=fixture(cache),data=new Blob(['new private original'],{type:'image/png'});
  await a.db.cloudTransaction(['blobs'],tx=>tx.objectStore('blobs').put({id:'new-blob',data}));
  assert.equal(await (await a.db.cloudGet('blobs','new-blob')).data.text(),'new private original');assert.equal(a.state.downloads,0);
  const b=fixture(cache);b.state.revision=a.state.revision;assert.equal(await (await b.db.cloudGet('blobs','new-blob')).data.text(),'new private original');assert.equal(b.state.downloads,0);
});
test('warm cloud reads reuse revision snapshots and hashes across store instances',async()=>{
  const cache=memoryCache(),a=fixture(cache);a.state.rows=[{id:'a',title:'cached'}];await a.db.cloudAll('assets');
  const b=fixture(cache);assert.equal((await b.db.cloudCachedCollections()),null,'partial cache must not hydrate four collections');
  assert.equal((await b.db.cloudAll('assets'))[0].title,'cached');assert.equal(b.state.reads||0,0);
  b.state.revision=1;b.state.rows=[{id:'a',title:'remote changed'}];assert.equal((await b.db.cloudRefresh()).changed,true);assert.equal((await b.db.cloudAll('assets'))[0].title,'remote changed');
  const c=fixture(cache);c.state.rows=[{id:'blob',storagePath:'owner-uuid/hash',storageProvider:'cloudbase'}];await c.db.cloudGet('blobs','blob');const d=fixture(cache);d.state.rows=c.state.rows;assert.equal(await (await d.db.cloudGet('blobs','blob')).data.text(),'private image');assert.equal(d.state.downloads,0);
});
test('warm startup includes same-revision account metadata without making it mandatory for old caches',async()=>{
  const cache=memoryCache(),owner='cloud:owner-uuid';
  for(const store of ['assets','series','projects','trash','meta'])
    await cache.put(owner,'records:'+store,{revision:7,records:[{id:store+'-item'}]});
  const first=fixture(cache);
  assert.deepEqual((await first.db.cloudCachedCollections()).meta,[{id:'meta-item'}]);
  await cache.put(owner,'records:meta',{revision:6,records:[{id:'stale'}]});
  const second=fixture(cache);
  const old=await second.db.cloudCachedCollections();
  assert.ok(old.assets.length);
  assert.equal(old.meta,undefined,'an older metadata cache must not invalidate the catalog');
});
test('verified unrelated cloud revisions reuse blob metadata; changed blobs still query the server',async()=>{
  const cache=memoryCache(),{state,db}=fixture(cache);
  state.rows=[{id:'b',storagePath:'owner-uuid/hash',storageProvider:'cloudbase',thumbnailPath:'owner-uuid/hash-preview480.webp'}];
  for(const store of ['assets','series','projects','trash'])await db.cloudAll(store);
  await db.cloudPreview('b');
  assert.equal(state.batchReads,1);
  state.revision=1;state.changes=[{revision:1,keys:[{store:'series',id:'other',action:'delete'}]}];
  const seriesDelta=await db.cloudRefresh();
  assert.equal(seriesDelta.incremental,true);
  assert.deepEqual(seriesDelta.changedStores,['series']);
  await db.cloudPreview('b');
  assert.equal(state.batchReads,1,'unrelated edits must not re-fetch each image record');
  state.revision=2;state.changes=[{revision:2,keys:[{store:'blobs',id:'b',action:'put'}]}];
  const blobDelta=await db.cloudRefresh();
  assert.equal(blobDelta.incremental,true);
  assert.deepEqual(blobDelta.changedStores,['blobs']);
  await db.cloudPreview('b');
  assert.equal(state.batchReads,2,'changed image metadata must be verified remotely');
});
test('reopened app reuses persisted image metadata after a verified unrelated delta',async()=>{
  const cache=memoryCache(),first=fixture(cache);
  first.state.rows=[{id:'b',storagePath:'owner-uuid/hash',storageProvider:'cloudbase',thumbnailPath:'owner-uuid/hash-preview480.webp'}];
  for(const store of ['assets','series','projects','trash'])await first.db.cloudAll(store);
  await first.db.cloudPreview('b');
  const reopened=fixture(cache);
  reopened.state.revision=1;
  reopened.state.changes=[{revision:1,keys:[{store:'series',id:'other',action:'delete'}]}];
  assert.ok(await reopened.db.cloudCachedCollections());
  assert.equal((await reopened.db.cloudRefresh()).incremental,true);
  await reopened.db.cloudPreview('b');
  assert.equal(reopened.state.batchReads||0,0,'returning to a cached page needs no per-image metadata request');
});
test('successful commits patch cached records; failed commits do not alter cache',async()=>{
  const cache=memoryCache(),a=fixture(cache);a.state.rows=[{id:'a',title:'before'}];await a.db.cloudAll('assets');
  await a.db.cloudTransaction(['assets'],tx=>tx.objectStore('assets').put({id:'a',title:'after'}));assert.equal((await a.db.cloudAll('assets'))[0].title,'after');assert.equal(a.state.reads,1);
  a.state.fail=true;await assert.rejects(a.db.cloudTransaction(['assets'],tx=>tx.objectStore('assets').put({id:'a',title:'failed'})));assert.equal((await a.db.cloudAll('assets'))[0].title,'after');
});
test('authorization gates cached reads and explicit logout clears private snapshots',async()=>{
  const cache=memoryCache(),a=fixture(cache);a.state.rows=[{id:'a'}];for(const store of ['assets','series','projects','trash'])await a.db.cloudAll(store);
  const denied=fixture(cache);denied.state.authError=true;await assert.rejects(denied.db.cloudCachedCollections(),/not authorized/);
  assert.ok(await a.db.cloudCachedCollections());await a.db.cloudClearCache();const reopened=fixture(cache);assert.equal(await reopened.db.cloudCachedCollections(),null);
  reopened.state.rows=[{id:'b',storagePath:'different-owner/hash',storageProvider:'cloudbase'}];await assert.rejects(reopened.db.cloudGet('blobs','b'),/不属于当前账号/);
});
test('cloud transactions serialize revisions and recover after an error without local fallback',async()=>{
  const {state,db}=fixture();const put=()=>db.cloudTransaction(['assets'],tx=>tx.objectStore('assets').put({id:'a'}));
  await Promise.all([put(),put()]);assert.deepEqual(state.calls.map(c=>c.base_revision),[0,1]);
  state.fail=true;await assert.rejects(put(),/conflict/);state.fail=false;await put();assert.equal(state.revision,3);
  state.revision++;state.keyVersions.set('assets:a',state.revision);
  await assert.rejects(put(),/conflict/);await assert.rejects(db.cloudCheckpoint(),/另一设备/);
});
test('private images upload before metadata and are never inline or overwritten',async()=>{
  const {state,db}=fixture();await db.cloudTransaction(['blobs'],tx=>tx.objectStore('blobs').put({id:'b',data:new Blob(['image'],{type:'image/png'})}));
  const upload=state.uploads[0],item=state.calls[0].operations[0].item;
  assert.match(upload.path,/^owner-uuid\/[a-f0-9]{64}$/);assert.equal(upload.options.upsert,false);assert.equal('data' in item,false);assert.equal(item.storagePath,upload.path);
  state.fail=true;const count=state.calls.length;await assert.rejects(db.cloudTransaction(['blobs'],tx=>tx.objectStore('blobs').put({id:'c',data:new Blob(['other'])})),/图片上传失败/);assert.equal(state.calls.length,count);
});
test('private image download cache and authorization failures are explicit',async()=>{
  const {state,db}=fixture();state.rows=[{id:'b',storagePath:'owner-uuid/hash',storageProvider:'cloudbase'}];await db.cloudGet('blobs','b');await db.cloudGet('blobs','b');assert.equal(state.downloads,1);
  const denied=fixture();denied.state.authError=true;await assert.rejects(denied.db.cloudAll('assets'),/not authorized/);assert.equal(denied.state.calls.length,0);
});
test('private thumbnails download without the original and reuse persistent hash cache',async()=>{
  const cache=memoryCache(),a=fixture(cache);a.state.rows=[{id:'b',storagePath:'owner-uuid/hash',storageProvider:'cloudbase',thumbnailPath:'owner-uuid/hash-preview480.webp'}];
  await a.db.cloudPreview('b');assert.equal(a.state.downloads,1);
  const b=fixture(cache);b.state.rows=a.state.rows;await b.db.cloudPreview('b');assert.equal(b.state.downloads,0);
  const denied=fixture();denied.state.rows=[{id:'b',storagePath:'owner-uuid/hash',storageProvider:'cloudbase',thumbnailPath:'other/hash-preview480.webp'}];await assert.rejects(denied.db.cloudPreview('b'),/缩略图不属于当前账号/);assert.equal(denied.state.downloads,0);
});
test('a missing remote thumbnail is rebuilt from its original instead of showing a broken card',async()=>{
  const a=fixture();a.state.missingThumbnail=true;a.state.rows=[{id:'b',storagePath:'owner-uuid/hash',storageProvider:'cloudbase',thumbnailPath:'owner-uuid/hash-preview480.webp'}];
  assert.equal(await (await a.db.cloudPreview('b')).text(),'private image');assert.ok(a.state.downloads>=2);
});
test('AI cover uses COS derivative only and never downloads original on error',async()=>{
  const calls=[],cos={enabled:true,
    async download(path){calls.push('GET:'+path);throw Error('COS 404');},
    async preview(path){calls.push('CI:'+path);throw Error('派生图暂不可用');}};
  const a=fixture(null,cos);a.state.rows=[{id:'b',storagePath:'owner-uuid/hash',storageProvider:'cloudbase'}];
  await assert.rejects(a.db.cloudPreview('b',480,{allowRemoteOriginal:false}),/派生图暂不可用/);
  assert.deepEqual(calls,['GET:owner-uuid/hash-preview480.webp','CI:owner-uuid/hash']);
});
test('CloudBase immutable thumbnails are reused without downloading originals',async()=>{
  const cache=memoryCache(),calls=[],remote=new Map(),original='owner-uuid/'+'a'.repeat(64),
    derived=original+'-preview480.webp';
  remote.set(original,new Blob(['original pixels']));
  remote.set(derived,new Blob(['small webp'],{type:'image/webp'}));
  const cos={enabled:true,
    async preview(path){calls.push('CI:'+path);return new Blob(['small webp'],{type:'image/webp'});},
    async download(path){calls.push('GET:'+path);if(!remote.has(path))throw Error('COS 404');return remote.get(path);},
    async upload(path,blob){calls.push('PUT:'+path);remote.set(path,blob);}
  },a=fixture(cache,cos);
  a.state.rows=[{id:'b',storagePath:original,storageProvider:'cloudbase'}];
  assert.equal(await (await a.db.cloudPreview('b')).text(),'small webp');
  assert.deepEqual(calls,['GET:'+derived]);
  const b=fixture(cache,cos);b.state.rows=a.state.rows;
  assert.equal(await (await b.db.cloudPreview('b')).text(),'small webp');
  assert.equal(calls.length,1,'account-local read cache avoids a network request');
  const otherDevice=fixture(null,cos);otherDevice.state.rows=a.state.rows;
  assert.equal(await (await otherDevice.db.cloudPreview('b')).text(),'small webp');
  assert.equal(calls.at(-1),'GET:'+derived,'new device reads the CloudBase WebP directly');
  assert.equal(calls.filter(x=>x.startsWith('CI:')).length,0);
  assert.equal(await (await b.db.cloudGet('blobs','b')).data.text(),'original pixels');
  assert.equal(calls.at(-1),'GET:'+original);
});
test('large works list only metadata; opening reuses the cached editable document and metadata edits preserve geometry',async()=>{
  const cache=memoryCache(),a=fixture(cache),full={id:'p',title:'before',activeDraftID:'d',drafts:[{id:'d',canvas:{width:100,height:100},items:[],textBlocks:[],strokes:[],makingSteps:[],primitives:Array.from({length:4000},(_,i)=>({id:String(i),kind:'vector',vectorLayers:[{fill:'#ff0000',rects:[[0,0,12,12]]}]}))}]};
  await a.db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put(v2(full)));const summary=a.state.calls[0].operations[0].item;a.state.rows=[summary];assert.ok(summary.projectDocumentPath);assert.equal(summary.drafts[0].layers.length,0);
  assert.equal((await a.db.cloudAll('projects'))[0].drafts[0].layers.length,0);assert.equal(a.state.downloads,0);
  const opened=await a.db.cloudGet('projects','p');assert.equal(opened.drafts[0].layers.length,4000);assert.equal(a.state.downloads,0);assert.equal('projectDocumentPath' in opened,false);
  assert.equal(opened.__cloudBaseSceneFingerprint,projectSemanticFingerprint({drafts:opened.drafts}),
    'the editing baseline must describe the full document, not its thin list summary');
  await a.db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put({...summary,title:'after'}));const last=a.state.uploads.at(-1),encoded=a.state.calls.at(-1).operations[0].item;const restored=JSON.parse(await projectBlobText(last.data,encoded.projectDocumentEncoding));assert.equal(restored.drafts[0].layers.length,4000);assert.equal(restored.title,'after');assert.ok(last.data.size<JSON.stringify(full).length/10);
  a.state.fail=true;const count=a.state.calls.length;await assert.rejects(a.db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put({...opened,title:'failed'})),/图片上传失败，未保存元数据/);assert.equal(a.state.calls.length,count);
  const denied=fixture();denied.state.rows=[{...summary,projectDocumentPath:'other/document'}];await assert.rejects(denied.db.cloudGet('projects','p'),/不属于当前账号/);
});

test('reopening a large work edits its hydrated Scene and keeps the same work ID',async()=>{
 const {state,db}=fixture(memoryCache());
 const original=v2({id:'reopened',title:'手帐',activeDraftID:'d',drafts:[{id:'d',
   canvas:{width:100,height:100},primitives:Array.from({length:3200},(_,i)=>({
     id:'shape-'+i,kind:'rectangle',x:i%90,y:i%80,width:12,height:12,fill:'#335544'}))}]});
 await db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put(original));
 state.rows=[state.calls.at(-1).operations[0].item];
 for(const position of [23,47]){
   const listed=(await db.cloudAll('projects'))[0];
   assert.equal(listed.__cloudBaseSceneFingerprint,null,
     'a thin listing cannot claim to be the full editing baseline');
   const editable=await db.cloudProjectDocument(listed);
   assert.equal(editable.__cloudBaseSceneFingerprint,
     projectSemanticFingerprint({drafts:editable.drafts}));
   editable.drafts[0].layers[0].x=position;
   await db.cloudStageProject(editable);
   await db.cloudFlushProjects();
   const saved=state.calls.at(-1).operations.find(op=>op.store==='projects').item;
   assert.equal(saved.id,'reopened','ordinary continuation must not create a conflict copy');
   const upload=state.uploads.find(item=>item.path===saved.projectDocumentPath);
   const full=JSON.parse(await projectBlobText(upload.data,saved.projectDocumentEncoding));
   assert.equal(full.drafts[0].layers[0].x,position,
     'the edited Scene must replace the old document bytes');
   state.rows=[saved];
 }
});

test('a reopened work does not fork when its cloud Scene still matches the opened base',async()=>{
 const {state,db}=fixture(memoryCache());
 const full=v2({id:'same-phone',title:'旧标题',activeDraftID:'d',drafts:[{id:'d',
   canvas:{width:100,height:100},primitives:Array.from({length:3200},(_,i)=>({
     id:'shape-'+i,kind:'rectangle',x:i%90,y:i%80,width:12,height:12,fill:'#335544'}))}]});
 await db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put(full));
 const summary=state.calls.at(-1).operations[0].item;state.rows=[summary];
 const opened=await db.cloudProjectDocument((await db.cloudAll('projects'))[0]);
 opened.drafts[0].layers[0].x=55;
 state.revision=2;
 state.rows=[{...summary,title:'云端改过标题'}];
 state.changes=[{revision:2,keys:[{store:'projects',id:'same-phone',action:'put'}]}];
 state.keyVersions.set('projects:same-phone',2);
 await db.cloudStageProject(opened);await db.cloudFlushProjects();
 const saved=state.calls.at(-1).operations.find(op=>op.store==='projects').item;
 assert.equal(saved.id,'same-phone');assert.equal(saved.title,'云端改过标题');
 assert.deepEqual((await db.cloudPendingProjects()),[]);
});

test('an older queued work with a summary fingerprint recovers its full opening Scene',async()=>{
 const cache=memoryCache(),first=fixture(cache);
 const full=v2({id:'older-session',title:'旧标题',activeDraftID:'d',drafts:[{id:'d',
   canvas:{width:100,height:100},primitives:Array.from({length:3200},(_,i)=>({
     id:'shape-'+i,kind:'rectangle',x:i%90,y:i%80,width:12,height:12,fill:'#335544'}))}]});
 await first.db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put(full));
 const summary=first.state.calls.at(-1).operations[0].item;first.state.rows=[summary];
 const older=await first.db.cloudProjectDocument((await first.db.cloudAll('projects'))[0]);
 assert.ok(summary.projectDocumentPath);
 older.__cloudBaseSceneFingerprint=projectSemanticFingerprint({drafts:summary.drafts});
 older.drafts[0].layers[0].x=81;
 const resumed=fixture(cache);resumed.state.revision=2;
 resumed.state.rows=[{...summary,title:'云端新标题'}];
 resumed.state.keyVersions.set('projects:older-session',2);
 resumed.state.changes=[{revision:2,keys:[{store:'projects',id:'older-session',action:'put'}]}];
 await resumed.db.cloudStageProject(older);await resumed.db.cloudFlushProjects();
 const saved=resumed.state.calls.at(-1).operations.find(op=>op.store==='projects').item;
 assert.equal(saved.id,'older-session');assert.equal(saved.title,'云端新标题');
});

test('an edited large work that becomes small no longer points to its old cloud document',async()=>{
 const {state,db}=fixture(memoryCache());
 const full=v2({id:'reduced',title:'作品',activeDraftID:'d',drafts:[{id:'d',
   canvas:{width:100,height:100},primitives:Array.from({length:3200},(_,i)=>({
     id:'shape-'+i,kind:'rectangle',x:i%90,y:i%80,width:12,height:12,fill:'#335544'}))}]});
 await db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put(full));
 const summary=state.calls.at(-1).operations[0].item;state.rows=[summary];
 const editable=await db.cloudProjectDocument((await db.cloudAll('projects'))[0]);
 editable.drafts[0].layers.splice(1);
 await db.cloudStageProject(editable);await db.cloudFlushProjects();
 const saved=state.calls.at(-1).operations[0].item;
 assert.equal(saved.id,'reduced');
 assert.equal(saved.projectDocumentPath,undefined);
 assert.equal(saved.drafts[0].layers.length,1);
});

test('cloudAll discards a mixed remote snapshot after concurrent pagination',async()=>{
  const {state,db}=fixture();
  state.rows=Array.from({length:501},(_,i)=>({id:String(i),title:'old'}));
  let changed=false;
  state.onReadPage=start=>{
    if(changed||start!==0)return;
    changed=true;
    state.revision=1;
    state.rows=Array.from({length:503},(_,i)=>({id:String(i),title:'new'}));
  };
  const result=await db.cloudAll('assets');
  assert.equal(result.length,503);
  assert.ok(result.every(row=>row.title==='new'));
  assert.ok(state.reads>=4,'must read all pages again after version changed');
});

test('visible private covers batch metadata by account and reuse previews without re-downloading',async()=>{
  const cache=memoryCache(),a=fixture(cache);a.state.rows=Array.from({length:12},(_,i)=>({id:'cover-'+i,storagePath:'owner-uuid/hash-'+i,storageProvider:'cloudbase',thumbnailPath:'owner-uuid/hash-'+i+'-preview480.webp'}));
  a.state.cloudCopies=a.state.rows.map(record=>({id:record.id,record}));
  const first=await Promise.all(a.state.rows.map(row=>a.db.cloudPreview(row.id)));
  assert.equal(first.length,12);assert.equal(a.state.batchReads,1);assert.equal(a.state.downloads,12);
  await Promise.all(a.state.rows.map(row=>a.db.cloudPreview(row.id)));
  assert.equal(a.state.batchReads,1);assert.equal(a.state.downloads,12);
});

test('small editable projects store a standalone cover and reuse it for metadata changes',async()=>{
  let rendered=0;
  const {state,db}=fixture(memoryCache(),null,async()=>{rendered++;return new Blob(['webp'],{type:'image/webp'});});
  state.cloudCopies=['fixture-paper','new'].map(id=>({id,record:{id,blobId:'fixture-image'}}));
  const project={id:'small',activeDraftID:'draft',drafts:[{id:'draft',canvas:{width:100,height:100},items:[{id:'item'}],primitives:[],textBlocks:[],strokes:[]}]};
  await db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put(v2(project)));
  const first=state.calls[0].operations[0].item,cover=first.drafts[0].coverImageID;
  assert.ok(cover.startsWith('project-cover:cloudbase:owner-uuid/'));
  assert.ok(cover.endsWith('-preview480.webp'));
  assert.equal(first.drafts[0].layers.length,1,'the editable document remains inline');
  assert.equal(await (await db.cloudPreview(cover)).text(),'webp');
  await db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put({...first,title:'new title'}));
  assert.equal(rendered,1,'metadata-only edits reuse the persisted snapshot');
  assert.equal(state.calls[1].operations[0].item.drafts[0].coverImageID,cover);
  await db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put({...first,drafts:[{...first.drafts[0],layers:[{type:'material',id:'changed',assetID:'new',x:50,y:50,width:30,height:30}]}]}));
  assert.equal(rendered,2,'visual changes generate a new snapshot');
  assert.notEqual(state.calls[2].operations[0].item.drafts[0].coverImageID,cover);
});

test('project WebP snapshot becomes visible only after confirmed CloudBase metadata commit',async()=>{
  const events=[],previousWindow=globalThis.window,previousCustomEvent=globalThis.CustomEvent;
  globalThis.window={dispatchEvent:event=>events.push({type:event.type,detail:event.detail})};
  globalThis.CustomEvent=class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}};
  try{
    const {state,db}=fixture(memoryCache(),{enabled:true,upload:async(path,data)=>{state.uploads.push({path,data});},download:async()=>new Blob(['cover'],{type:'image/webp'})},
      async()=>new Blob(['webp'],{type:'image/webp'}));
    const record={id:'w',title:'editable',updatedAt:'2026-10-09T01:00:00Z',activeDraftID:'d',
      drafts:[{id:'d',canvas:{width:400,height:600},items:[],primitives:[],textBlocks:[],strokes:[]}]};
    await db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put(v2(record)));
    const coverEvents=events.filter(e=>e.type==='shiye-project-cover-ready');
    assert.equal(coverEvents.length,1);
    assert.equal(coverEvents[0].detail.projectID,'w');
    assert.match(coverEvents[0].detail.coverImageID,/^project-cover:cloudbase:owner-uuid\//);
    assert.equal(state.calls.length,1);
    const before=coverEvents.length;
    state.fail=true;
    await assert.rejects(db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put({...record,title:'failure'})),/conflict/);
    assert.equal(events.filter(e=>e.type==='shiye-project-cover-ready').length,before);
  }finally{
    if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
    if(previousCustomEvent===undefined)delete globalThis.CustomEvent;else globalThis.CustomEvent=previousCustomEvent;
  }
});


test('all user-facing deletes are staged as remote delete plus trash entry and survive flush',async()=>{
  for(const [kind,store] of [['material','assets'],['work','projects']]){
    const cache=memoryCache(),{state,db}=fixture(cache);
    const original={id:kind+'-1',title:kind==='work'?'第一页':'纸片'};
    const tombstone={id:kind+'-trash',kind:kind==='work'?'project':'asset',item:original,
      date:new Date().toISOString()};
    await db.cloudStageMutation([store,'trash'],tx=>{
      tx.objectStore(store).delete(original.id);
      tx.objectStore('trash').put(tombstone);
    });
    assert.equal((await activeRows(cache,'batch')).length,1,
      'Deletion is durable before any remote network acknowledgement');
    assert.deepEqual((await db.cloudAll('trash')).map(x=>x.id),[tombstone.id],
      'Trash is immediately visible before remote upload');
    await db.cloudFlushProjects();
    assert.deepEqual(state.calls.at(-1).operations.map(op=>op.store+':'+op.action),
      [store+':delete','trash:put','meta:put']);
    assert.equal(state.calls.at(-1).operations.at(-1).item.id,'tombstone:'+store+':'+original.id);
    assert.deepEqual(await activeRows(cache,'batch'),[],
      'Committed remote deletion must leave no unsynced tombstones');
  }
});
test('an older queued material delete keeps a cloud record when an editable work references it',async()=>{
  const {state,db}=fixture(memoryCache());
  const material={id:'referenced-material',blobId:'image'};
  const work=v2({id:'referencing-work',activeDraftID:'page',drafts:[{
    id:'page',sceneVersion:2,canvas:{width:400,height:600},layers:[{
      id:'cutout',type:'material',assetID:material.id,x:50,y:50,width:40,height:40
    }]
  }]});
  state.rows=[material,work];
  await db.cloudTransaction(['assets'],tx=>tx.objectStore('assets').delete(material.id));
  const operation=state.calls.at(-1).operations.find(op=>op.store==='assets');
  assert.equal(operation.action,'put');
  assert.equal(operation.item.id,material.id);
  assert.equal(operation.item.isProjectInternal,true);
  assert.ok(operation.item.hiddenFromLibraryAt);
  assert.ok(!state.calls.at(-1).operations.some(op=>op.store==='meta'&&op.item?.id==='tombstone:assets:'+material.id));
});
test('a new work cannot reach the cloud before its material, while an existing orphan remains editable',async()=>{
  const {state,db}=fixture(memoryCache());
  const work={id:'source-check',activeDraftID:'page',drafts:[{
    id:'page',sceneVersion:2,canvas:{width:400,height:600},layers:[{
      id:'cutout',type:'material',assetID:'missing-material',x:50,y:50,width:40,height:40
    }]
  }]};
  await assert.rejects(db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put(work)),
    /素材尚未同步到云端/);
  assert.equal(state.calls.length,0);
  await db.cloudTransaction(['assets','projects'],tx=>{
    tx.objectStore('assets').put({id:'missing-material',blobId:'image'});
    tx.objectStore('projects').put(work);
  });
  assert.equal(state.calls.length,1);
  state.rows=[work];
  await db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put({...work,title:'metadata edit'}));
  assert.equal(state.calls.length,2);
});
test('rapid delete followed by explicit restore replays the entire recovery after a stale revision',async()=>{
 const cache=memoryCache(),{db,state}=fixture(cache);
 const original={id:'fast-deleted',title:'保留此素材',updatedAt:'2026-10-01T00:00:00Z'};
 const card={id:'fast-trash',kind:'asset',item:original,date:'2026-10-10T00:00:00Z'};
 await db.cloudStageMutation(['assets','trash'],tx=>{
   tx.objectStore('assets').delete(original.id);
   tx.objectStore('trash').put(card);
 });
 await db.cloudStageMutation(['assets','trash','meta'],tx=>{
   tx.objectStore('meta').delete('tombstone:assets:'+original.id);
   tx.objectStore('trash').delete(card.id);
   tx.objectStore('assets').put(original);
 });
 // Emulate the second device's view just after the first delete commits.
 // Its tombstone and trash card win over old edit timestamps.
 state.rows=[{id:'tombstone:assets:'+original.id,kind:'tombstone',deletedAt:card.date},card];
 state.changes=[{revision:1,keys:[
   {store:'assets',action:'delete',id:original.id},
   {store:'trash',action:'put',id:card.id},
   {store:'meta',action:'put',id:'tombstone:assets:'+original.id}
 ]}];
 await db.cloudFlushProjects();
 assert.equal(state.calls.length,2);
 assert.deepEqual(state.calls[1].operations.map(op=>op.store+':'+op.action).sort(),
   ['assets:put','meta:delete','trash:delete'].sort(),
   'explicit restore must survive a just-committed same-record deletion and consume the trash card');
 assert.deepEqual(await activeRows(cache,'batch'),[]);
});

test('permanent trash deletion uses durable cloud outbox and sends real delete op',async()=>{
  const cache=memoryCache(),{state,db}=fixture(cache);
  await db.cloudStageMutation(['trash'],tx=>tx.objectStore('trash').delete('gone'));
  assert.equal((await activeRows(cache,'batch')).length,1);
  await db.cloudFlushProjects();
  assert.deepEqual(state.calls.at(-1).operations.map(op=>[op.store,op.action,op.id]),
    [['trash','delete','gone']]);
  assert.deepEqual(await activeRows(cache,'batch'),[]);
});


test('deleting a work retires an older queued autosave so the work is not resurrected',async()=>{
  const cache=memoryCache(),{state,db}=fixture(cache);
  const doc={id:'work-to-remove',title:'Pending edit',
    activeDraftID:'draft',drafts:[{id:'draft',canvas:{width:600,height:800},
      items:[],primitives:[],textBlocks:[],strokes:[]}]};
  await db.cloudStageProject(v2(doc));
  assert.equal((await activeRows(cache,'project')).length,1);
  await db.cloudStageMutation(['projects','trash'],tx=>{
    tx.objectStore('projects').delete(doc.id);
    tx.objectStore('trash').put({id:'deleted-work-entry',kind:'project',item:doc,
      date:new Date().toISOString()});
  });
  assert.deepEqual(await activeRows(cache,'project'),[],
    'Delete should remove its obsolete pending autosave');
  await db.cloudFlushProjects();
  const operations=state.calls.flatMap(c=>c.operations);
  assert.ok(operations.some(op=>op.store==='projects'&&op.action==='delete'&&op.id===doc.id));
  assert.ok(!operations.some(op=>op.store==='projects'&&op.action==='put'&&op.item.id===doc.id),
    'No stale project put may resurrect a deleted work');
  assert.deepEqual(await activeRows(cache,'batch'),[]);
});


test('persistent COS tier index reuses a cached higher-resolution image on a later visit',async()=>{
  const cache=memoryCache(),calls=[];
  const objectStorage={enabled:true,
    async preview(path,variant){calls.push([path,variant]);return new Blob([variant],{type:'image/webp'});},
    async download(){throw Error('A larger cached image must be used without COS GET');},
    async upload(){throw Error('No derived upload is required for an oversized cached tier');}
  };
  const record={id:'sample',storageProvider:'cloudbase',storagePath:'owner-uuid/'+'a'.repeat(64)};
  const first=fixture(cache,objectStorage);first.state.rows=[record];
  assert.equal(await (await first.db.cloudPreview('sample',960)).text(),'preview960');
  assert.deepEqual(calls,[[record.storagePath,'preview960']]);
  const reopen=fixture(cache,objectStorage);reopen.state.rows=[record];
  assert.equal(await (await reopen.db.cloudPreview('sample',480)).text(),'preview960');
  assert.equal(await (await reopen.db.cloudPreview('sample',600)).text(),'preview960');
  assert.equal(calls.length,1,'No redundant small-tier COS processing after reload');
});

test('older generic project PUT from the same phone is rescued without overwriting a later remote edit',async()=>{
 const cache=memoryCache(),{state,db}=fixture(cache);
 const work=v2({id:'same-work',title:'本机未同步的早期版本',activeDraftID:'draft',
  drafts:[{id:'draft',canvas:{width:700,height:1000},items:[],textBlocks:[{id:'text',content:'留住这一页'}],primitives:[],strokes:[]}]});
 await db.cloudStageImport({assets:[],blobs:[],projects:[work]});
 assert.equal((await activeRows(cache,'batch')).length,1);
 // An editor write (or a second tab on the same phone) has already advanced
 // this document. It must remain untouched by the old generic queue.
 state.revision=1;
 state.rows=[{...structuredClone(work),title:'已经上传的较新版本'}];
 state.changes=[{revision:1,keys:[{store:'projects',id:'same-work',action:'put'}]}];

 await db.cloudFlushProjects();
 assert.equal(state.rows[0].title,'已经上传的较新版本');
 assert.deepEqual(await activeRows(cache,'batch'),[]);
 assert.equal((await db.cloudPendingDetails()).batches.length,0);
});

test('a concurrent material edit without a comparable timestamp keeps the committed cloud version',async()=>{
 const {state,db}=fixture(memoryCache());
 await db.cloudAll('assets');
 await db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').put({id:'same-asset',title:'本机修改'}));
 state.revision=1;
 state.rows=[{id:'same-asset',title:'另一设备修改'}];
 state.changes=[{revision:1,keys:[{store:'assets',id:'same-asset',action:'put'}]}];
 await db.cloudFlushProjects();
 assert.equal((await db.cloudPendingDetails()).batches.length,0);
 assert.equal(state.rows[0].title,'另一设备修改');
});

test('two devices changing disjoint material fields merge without losing either value',async()=>{
 const {state,db}=fixture(memoryCache());
 state.rows=[{id:'same-asset',title:'原名',tags:['原标签'],blobId:'same-image'}];
 await db.cloudAll('assets');
 await db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').put({
   id:'same-asset',title:'手机新名字',tags:['原标签'],blobId:'same-image'
 }));
 state.revision=1;
 state.rows=[{id:'same-asset',title:'原名',tags:['平板新标签'],blobId:'same-image'}];
 state.changes=[{revision:1,keys:[{store:'assets',id:'same-asset',action:'put'}]}];
 await db.cloudFlushProjects();
 assert.equal(state.calls.length,2);
 const merged=state.calls.at(-1).operations[0].item;
 assert.equal(merged.id,'same-asset');
 assert.equal(merged.title,'手机新名字');
 assert.deepEqual(merged.tags,['平板新标签']);
 assert.equal(merged.blobId,'same-image');
 assert.equal(merged.__syncFieldStamps.title.counter,1);
 assert.equal((await db.cloudPendingDetails()).batches.length,0);
});

test('two devices changing different series details retain both edits',async()=>{
 const {state,db}=fixture(memoryCache());
 state.rows=[{id:'series-a',title:'原名',introduction:'原介绍'}];
 await db.cloudAll('series');
 await db.cloudStageMutation(['series'],tx=>tx.objectStore('series').put({
   id:'series-a',title:'手机新名',introduction:'原介绍'}));
 state.revision=1;state.rows=[{id:'series-a',title:'原名',introduction:'平板新介绍'}];
 state.changes=[{revision:1,keys:[{store:'series',id:'series-a',action:'put'}]}];
 await db.cloudFlushProjects();
 const result=state.calls.at(-1).operations[0].item;
 assert.equal(result.title,'手机新名');
 assert.equal(result.introduction,'平板新介绍');
 assert.deepEqual((await db.cloudPendingDetails()).batches,[]);
});

test('a material edit bundled with image bytes still merges independent cloud metadata',async()=>{
 const {state,db}=fixture(memoryCache());
 state.rows=[{id:'material',title:'原名',tags:['旧标签'],blobId:'old-image'}];
 await db.cloudAll('assets');
 await db.cloudStageMutation(['assets','blobs'],tx=>{
   tx.objectStore('assets').put({id:'material',title:'新名字',tags:['旧标签'],blobId:'old-image'});
   tx.objectStore('blobs').put({id:'unrelated-image',data:new Blob(['bytes'])});
 });
 state.revision=1;state.rows=[{id:'material',title:'原名',tags:['新标签'],blobId:'old-image'}];
 state.changes=[{revision:1,keys:[{store:'assets',id:'material',action:'put'}]}];
 await db.cloudFlushProjects();
 const asset=state.calls.at(-1).operations.find(op=>op.store==='assets').item;
 assert.equal(asset.title,'新名字');assert.deepEqual(asset.tags,['新标签']);
 assert.deepEqual((await db.cloudPendingDetails()).batches,[]);
});

test('project details keep independent edits from both devices',async()=>{
 const {state,db}=fixture(memoryCache());
 const base=v2({id:'work',title:'旧名',styleTags:['旧标签'],activeDraftID:'d',
   drafts:[{id:'d',canvas:{width:100,height:100},textBlocks:[{id:'t',text:'正文'}]}]});
 state.rows=[base];await db.cloudAll('projects');
 await db.cloudStageMutation(['projects'],tx=>tx.objectStore('projects').put({...base,title:'新名字'}));
 state.revision=1;state.rows=[{...base,styleTags:['新标签']}];
 state.changes=[{revision:1,keys:[{store:'projects',id:'work',action:'put'}]}];
 await db.cloudFlushProjects();
 const work=state.calls.at(-1).operations.find(op=>op.store==='projects').item;
 assert.equal(work.title,'新名字');assert.deepEqual(work.styleTags,['新标签']);
 assert.equal(work.id,'work');
});

test('same material field competition settles automatically and leaves no pending queue',async()=>{
 const {state,db}=fixture(memoryCache());
 state.rows=[{id:'same-asset',title:'原名',tags:['原标签'],updatedAt:'2026-10-15T10:00:00Z'}];
 await db.cloudAll('assets');
 await db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').put({
   id:'same-asset',title:'手机新名字',tags:['原标签'],updatedAt:'2026-10-15T10:02:00Z'
 }));
 state.revision=1;
 state.rows=[{id:'same-asset',title:'平板新名字',tags:['新标签'],updatedAt:'2026-10-15T10:01:00Z'}];
 state.changes=[{revision:1,keys:[{store:'assets',id:'same-asset',action:'put'}]}];
 await db.cloudFlushProjects();
 assert.equal((await db.cloudPendingDetails()).batches.length,0);
 assert.equal(state.calls.at(-1).operations[0].item.title,'手机新名字');
 assert.deepEqual(state.calls.at(-1).operations[0].item.tags,['新标签']);
 assert.deepEqual(state.calls.at(-1).operations[0].item.__syncFieldStamps.title,
   state.calls[0].operations[0].item.__syncFieldStamps.title);
});

test('successive offline metadata edits inherit the pending value and preserve a revert',async()=>{
 const cache=memoryCache(),{state,db}=fixture(cache);
 state.rows=[{id:'same-asset',title:'原名',tags:['原标签']}];
 await db.cloudAll('assets');
 await Promise.all([
   db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').put({
     id:'same-asset',title:'第一次修改',tags:['原标签']
   })),
   db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').put({
     id:'same-asset',title:'原名',tags:['原标签']
   }))
 ]);
 const [first,second]=(await activeRows(cache,'batch')).map(row=>row.record.operations[0]);
 assert.equal(first.baseRecord.title,'原名');
 assert.equal(first.item.__syncFieldStamps.title.counter,1);
 assert.equal(second.baseRecord.title,'第一次修改');
 assert.deepEqual(second.baseRecord.__syncFieldStamps.title,first.item.__syncFieldStamps.title);
 assert.equal(second.item.title,'原名');
 assert.equal(second.item.__syncFieldStamps.title.counter,2);
 await db.cloudFlushProjects();
 assert.equal(state.calls.length,2);
 assert.equal(state.calls[1].base_revision,1);
 assert.equal(state.calls[1].operations[0].item.title,'原名');
 assert.deepEqual(await activeRows(cache,'batch'),[]);
});

test('a failed local metadata stage releases the next independent edit',async()=>{
 const cache=memoryCache(),{db}=fixture(cache);
 const first=db.cloudStageMutation(['assets'],()=>{throw Error('local form failed');});
 const second=db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').put({
   id:'independent',title:'second form'
 }));
 await assert.rejects(first,/local form failed/);
 await second;
 assert.equal((await activeRows(cache,'batch'))[0].record.operations[0].item.id,'independent');
});

test('a newer cloud image edit discards unreferenced old bytes automatically',async()=>{
 const {state,db}=fixture(memoryCache());
 await db.cloudAll('assets');
 await db.cloudStageMutation(['assets','blobs'],tx=>{
  tx.objectStore('assets').put({id:'same-asset',title:'本机修改',blobId:'new-image'});
  tx.objectStore('blobs').put({id:'new-image',data:new Blob(['private-image'])});
 });
 state.revision=1;
 state.rows=[{id:'same-asset',title:'云端修改',blobId:'older-image'}];
 state.changes=[{revision:1,keys:[{store:'assets',id:'same-asset',action:'put'}]}];
 await db.cloudFlushProjects();
 assert.equal((await db.cloudPendingDetails()).batches.length,0);
 assert.equal(state.rows[0].title,'云端修改');
});

test('an older delete loses to a cloud edit without manual conflict',async()=>{
 const {state,db}=fixture(memoryCache());
 await db.cloudAll('assets');
 await db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').delete('same-asset'));
 state.revision=1;
 state.rows=[{id:'same-asset',title:'云端修改'}];
 state.changes=[{revision:1,keys:[{store:'assets',id:'same-asset',action:'put'}]}];
 await db.cloudFlushProjects();
 assert.equal((await db.cloudPendingDetails()).batches.length,0);
 assert.equal(state.rows[0].title,'云端修改');
});

test('an older import loses to a different cloud image without manual conflict',async()=>{
 const {state,db}=fixture(memoryCache());
 await db.cloudAll('assets');
 await db.cloudStageImport({assets:[{id:'same-asset',title:'本机导入',blobId:'new-image'}],
  blobs:[{id:'new-image',data:new Blob(['original-image'])}],projects:[]});
 state.revision=1;
 state.rows=[{id:'same-asset',title:'云端已有素材'}];
 state.changes=[{revision:1,keys:[{store:'assets',id:'same-asset',action:'put'}]}];
 await db.cloudFlushProjects();
 assert.equal((await db.cloudPendingDetails()).batches.length,0);
 assert.equal(state.rows[0].title,'云端已有素材');
});

test('a stale collection clear keeps newer cloud data automatically',async()=>{
 const {state,db}=fixture(memoryCache());
 await db.cloudAll('assets');
 await db.cloudStageMutation(['assets'],tx=>tx.objectStore('assets').clear());
 state.revision=1;
 state.rows=[{id:'new-asset',title:'另一设备新增'}];
 state.changes=[{revision:1,keys:[{store:'assets',id:'new-asset',action:'put'}]}];
 await db.cloudFlushProjects();
 assert.equal((await db.cloudPendingDetails()).batches.length,0);
 assert.equal(state.rows[0].title,'另一设备新增');
});

test('a restored editable work in a batch automatically preserves a divergent cloud Scene',async()=>{
  const cache=memoryCache(),{db,state}=fixture(cache);
  const local=v2({id:'restored-work',title:'local',updatedAt:'2026-10-16T10:00:00Z',
    activeDraftID:'d',drafts:[{id:'d',canvas:{width:100,height:100},textBlocks:[{id:'text',text:'local'}]}]});
  await db.cloudStageMutation(['projects'],tx=>tx.objectStore('projects').put(local));
  state.rows=[v2({...local,title:'remote',drafts:[{id:'d',canvas:{width:100,height:100},textBlocks:[{id:'text',text:'remote'}]}]})];
  state.revision=1;state.keyVersions.set('projects:restored-work',1);
  await db.cloudFlushProjects();
  const fork=state.calls.at(-1).operations.find(op=>op.store==='projects').item;
  assert.notEqual(fork.id,local.id);assert.equal(fork.drafts[0].layers[0].text,'local');
  assert.equal(fork.forkOrigin.projectID,local.id);
  assert.deepEqual(await activeRows(cache,'batch'),[]);
  assert.equal((await db.cloudPendingDetails()).batches.length,0);
});

test('existing edited fork never strands the original project queue or overwrites the fork',async()=>{
  const {forkIDForBranch,forkConflictingEditableWork}=await import('../src/sync-conflict-copy.js');
  const {state,db}=fixture(memoryCache());
  const local=v2({id:'occupied-work',title:'本机作品',__cloudSessionId:'existing-branch',activeDraftID:'d',
    drafts:[{id:'d',canvas:{width:700,height:1000},textBlocks:[{id:'t',content:'本机正文'}]}]});
  const target=await forkIDForBranch(state.accountEpoch,local.id,local.__cloudSessionId);
  const existing=forkConflictingEditableWork(local,{id:target});
  existing.drafts[0].layers[0].content='副本又被修改';
  const remote=structuredClone(local);remote.drafts[0].layers[0].content='其他设备正文';
  state.revision=4;state.rows=[remote,existing];await db.cloudAll('projects');
  await db.cloudStageProject(local);await db.cloudFlushProjects();
  assert.equal((await db.cloudPendingProjects()).length,0);
  const uploaded=state.calls.at(-1).operations.find(op=>op.store==='projects').item;
  assert.notEqual(uploaded.id,local.id);assert.notEqual(uploaded.id,target);
  assert.equal(uploaded.drafts[0].layers[0].content,'本机正文');
  assert.equal(existing.drafts[0].layers[0].content,'副本又被修改');
});


test('CloudBase cache purge has no stale parallel thumbnail worker references',async()=>{
 const cache=memoryCache();let purged=false;
 cache.purgeAccount=async()=>{purged=true;return 1;};
 cache.close=async()=>{};
 const {db}=fixture(cache);
 const count=await db.cloudPurgeLocalAfterReset();
 assert.equal(count,1);
 assert.equal(purged,true);
});

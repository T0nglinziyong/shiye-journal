import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudStore} from '../src/cloud-store.js';
import {projectBlobText} from '../src/project-document.js';

function fixture(cache=null,objectStorage=null,projectPreview=()=>null){
  const state={revision:0,rows:[],calls:[],commits:new Map(),fail:false,authError:false,uploads:[],downloads:0};
  const client={from(table){
    const filters={};const query={select(){return query;},eq(k,v){filters[k]=v;return query;},in(k,v){filters[k]=v;return query;},limit(){return query;},abortSignal(){return query;},order(){return query;},
      then(resolve){state.batchReads=(state.batchReads||0)+1;const rows=filters.store==='blobs'&&Array.isArray(filters.id)?(state.cloudCopies||state.rows.map(record=>({id:record.id,record}))):(state.cloudCopies||[]);return Promise.resolve(resolve({data:rows.filter(row=>!filters.id||(Array.isArray(filters.id)?filters.id.includes(row.id):row.id===filters.id))}));},
      async range(start,end){state.reads=(state.reads||0)+1;const rows=state.rows.slice(start,end+1).map(record=>({record}));state.onReadPage?.(start,end);return {data:rows};},
      async single(){return {data:{revision:state.revision,account_epoch:'epoch-fixture'}};},
      async maybeSingle(){return {data:table==='shiye_commits'?(state.commits.has(filters.operation_id)?{revision:state.commits.get(filters.operation_id)}:null):table==='shiye_commit_receipts_v3'?null:state.rows.filter(r=>r.id===filters.id).map(record=>({record}))[0]||null};}};
    if(table==='shiye_changes')return {select(){return this;},eq(){return this;},gt(){return this;},lte(){return this;},order(){return this;},async range(){return state.changes?{data:state.changes}:{error:{message:'change log not installed'}};}};
    assert.ok(['shiye_records','shiye_revisions','shiye_commits','shiye_commit_receipts_v3'].includes(table));return query;
  },
    async rpc(name,args){
      assert.equal(name,'shiye_commit_v3_guarded');state.calls.push(args);
      if(state.rpcAbort)throw new DOMException('request aborted','AbortError');
      const receipt=revision=>({status:'applied',revision,accountEpoch:'epoch-fixture',syncProtocolVersion:3});
      if(state.commits.has(args.operation_id))return state.loseAck?{error:{message:'network response lost'}}:{data:receipt(state.commits.get(args.operation_id))};
      const changed=args.base_revision<state.revision&&args.operations.some(op=>{
        const id=op.item?.id??op.id;
        if(!Array.isArray(state.changes))return state.rows.some(row=>row.id===id);
        return state.changes.some(row=>row.revision>args.base_revision&&
          row.keys.some(key=>key.store===op.store&&(key.action==='clear'||key.id===id)));
      });
      if(state.fail||args.base_revision>state.revision||changed)return {error:{message:'conflict',code:'40001'}};
      const revision=++state.revision;state.commits.set(args.operation_id,revision);
      if(state.loseAck)return {error:{message:'network response lost'}};
      return {data:receipt(revision)};
    }
  };
  const cos=objectStorage||{enabled:true,
    async upload(path,data){state.uploads.push({path,data});await state.uploadGate;if(state.fail)throw Error('COS upload failed');},
    async download(path){state.downloads++;return state.uploads.find(row=>row.path===path)?.data||new Blob(['private image']);},
    async probe(){return true;}
  };
  const db=createCloudStore({cache,objectStorage:cos,projectPreview,cloudClient:()=>client,requireCloudUser:async()=>{if(state.authError)throw Error('not authorized');return {id:'owner-uuid'};}});
  return {state,db};
}

function memoryCache(){const rows=new Map();return {async get(owner,key){return structuredClone(rows.get(owner+':'+key));},async put(owner,key,value){rows.set(owner+':'+key,structuredClone(value));},async clear(owner){for(const key of rows.keys())if(key.startsWith(owner+':'))rows.delete(key);}};}
const mkProject=(id,title='新的手帐')=>({id,title,isDraft:true,activeDraftID:'page',drafts:[{id:'page',sceneVersion:2,canvas:{width:707,height:1000},pageMode:'single',layers:[]}]});
test('first and second saves of a new Scene v2 project share an acknowledged baseline',async()=>{
 const cache=memoryCache(),{state,db}=fixture(cache),newProject=mkProject(crypto.randomUUID());
 await db.cloudStageProject(newProject);
 assert.ok(newProject.__cloudSessionId,'first stage must bind a durable session before remote upload');
 assert.equal((await db.cloudPendingProjects())[0].baseRevision,0);
 await db.cloudFlushProjects();
 await db.cloudStageProject({...newProject,title:'第二次编辑'});
 assert.equal((await db.cloudPendingProjects())[0].baseRevision,1);
 await db.cloudFlushProjects();
 assert.deepEqual(state.calls.map(c=>c.base_revision),[0,1]);
 assert.deepEqual(await db.cloudPendingProjects(),[]);
});
test('reopening before upload shows the durable local project instead of the old cloud draft',async()=>{
 const cache=memoryCache(),first=fixture(cache),remote=mkProject('diary','云端旧稿');
 first.state.revision=1;first.state.rows=[remote];
 const local=(await first.db.cloudAll('projects'))[0];
 local.title='本机新稿';
 local.drafts[0].layers.push({id:'new-ink',type:'ink',color:'#335544',width:2,
   points:[{x:1,y:2},{x:3,y:4}]});
 await first.db.cloudStageProject(local);
 const reopened=fixture(cache);reopened.state.revision=1;reopened.state.rows=[remote];
 const listed=(await reopened.db.cloudAll('projects')).find(row=>row.id==='diary');
 assert.equal(listed.title,'本机新稿');
 assert.equal(listed.drafts[0].layers[0].id,'new-ink');
 assert.equal((await reopened.db.cloudGet('projects','diary')).drafts[0].layers[0].id,'new-ink');
});
test('a pending project detail edit keeps the newer pending Scene on reopen',async()=>{
 const cache=memoryCache(),first=fixture(cache),remote=mkProject('diary','云端旧稿');
 first.state.revision=1;first.state.rows=[remote];
 const local=(await first.db.cloudAll('projects'))[0];
 local.drafts[0].layers.push({id:'new-ink',type:'ink',color:'#335544',width:2,
   points:[{x:1,y:2},{x:3,y:4}]});
 await first.db.cloudStageProject(local);
 await first.db.cloudStageMutation(['projects'],tx=>tx.objectStore('projects').put({
   ...remote,title:'本机新标题'}));
 const reopened=fixture(cache);reopened.state.revision=1;reopened.state.rows=[remote];
 const listed=(await reopened.db.cloudAll('projects'))[0];
 assert.equal(listed.title,'本机新标题');
 assert.equal(listed.drafts[0].layers[0].id,'new-ink');
 assert.equal((await reopened.db.cloudGet('projects','diary')).drafts[0].layers[0].id,'new-ink');
});
test('independent scene edits preserve both complete works and upload a new editable ID',async()=>{
 const cache=memoryCache(),{state,db}=fixture(cache);
 const saved=mkProject('diary','服务器原稿');state.revision=1;state.rows=[saved];
 const opened=(await db.cloudAll('projects'))[0];
 const remote=mkProject('diary','另一台设备已经修改');
 remote.drafts[0].layers.push({id:'remote-ink',type:'ink',color:'#223344',width:2,points:[{x:3,y:4}]});
 state.revision=2;state.rows=[remote];
 state.changes=[{revision:2,keys:[{store:'projects',action:'put',id:'diary'}]}];
 await db.cloudRefresh();
 const local=structuredClone(opened);
 local.title='本地编辑';
 local.drafts[0].layers.push({id:'local-ink',type:'ink',color:'#223344',width:2,points:[{x:7,y:8}]});
 await db.cloudStageProject(local);
 await db.cloudFlushProjects();
 assert.equal(state.calls.length,2,'the server first rejects the old document, then accepts its separate branch');
 assert.notEqual(state.calls.at(-1).operations[0].item.id,'diary');
 const retained=await db.cloudListPreConflictScenes();
 assert.equal(retained.length,1);
 const pair=await cache.get('cloud:owner-uuid',retained[0].key);
 assert.equal(pair.local.title,'本地编辑');
 assert.equal(pair.remote.title,'另一台设备已经修改');
 assert.equal(pair.local.drafts[0].sceneVersion,2);
 assert.equal((await db.cloudPendingProjects()).length,0);
});

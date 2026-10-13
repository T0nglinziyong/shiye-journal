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
      async single(){return {data:{revision:state.revision}};},
      async maybeSingle(){return {data:table==='shiye_commits'?(state.commits.has(filters.operation_id)?{revision:state.commits.get(filters.operation_id)}:null):state.rows.filter(r=>r.id===filters.id).map(record=>({record}))[0]||null};}};
    if(table==='shiye_changes')return {select(){return this;},eq(){return this;},gt(){return this;},lte(){return this;},order(){return this;},async range(){return state.changes?{data:state.changes}:{error:{message:'change log not installed'}};}};
    assert.ok(['shiye_records','shiye_revisions','shiye_commits'].includes(table));return query;
  },storage:{from(bucket){assert.equal(bucket,'shiye-private');return {
    async upload(path,data,options){state.uploads.push({path,data,options});await state.uploadGate;return {error:state.fail?{statusCode:500}:null};},
    async download(path){state.downloads++;return {data:state.uploads.find(row=>row.path===path)?.data||new Blob(['private image']),error:state.missingThumbnail&&path.includes('preview480')?{message:'thumbnail missing'}:null};}};}},
    async rpc(name,args){assert.equal(name,'shiye_commit_v2');state.calls.push(args);if(state.rpcAbort)throw new DOMException('request aborted','AbortError');if(state.commits.has(args.operation_id))return state.loseAck?{error:{message:'network response lost'}}:{data:state.commits.get(args.operation_id)};if(state.fail||args.expected_revision!==state.revision)return {error:{message:'conflict'}};const revision=++state.revision;state.commits.set(args.operation_id,revision);if(state.loseAck)return {error:{message:'network response lost'}};return {data:revision};}
  };
  const db=createCloudStore({cache,objectStorage,projectPreview,cloudClient:()=>client,requireCloudUser:async()=>{if(state.authError)throw Error('not authorized');return {id:'owner-uuid'};}});
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
 assert.deepEqual(state.calls.map(c=>c.expected_revision),[0,1]);
 assert.deepEqual(await db.cloudPendingProjects(),[]);
});
test('a real remote same-work edit preserves both variants and leaves the local upload pending',async()=>{
 const cache=memoryCache(),{state,db}=fixture(cache);
 const saved=mkProject('diary','服务器原稿');state.revision=1;state.rows=[saved];
 const opened=(await db.cloudAll('projects'))[0];
 state.revision=2;state.rows=[mkProject('diary','另一台设备已经修改')];
 state.changes=[{revision:2,keys:[{store:'projects',action:'put',id:'diary'}]}];
 await db.cloudRefresh();
 await db.cloudStageProject({...opened,title:'本地编辑'});
 await db.cloudFlushProjects();
 assert.equal(state.calls.length,0,'an undated local edit cannot overwrite the newer cloud revision');
 const retained=await db.cloudListPreConflictScenes();
 assert.equal(retained.length,1);
 const pair=await cache.get('cloud:owner-uuid',retained[0].key);
 assert.equal(pair.local.title,'本地编辑');
 assert.equal(pair.remote.title,'另一台设备已经修改');
 assert.equal(pair.local.drafts[0].sceneVersion,2);
 assert.equal((await db.cloudPendingProjects()).length,1,'the local edit remains recoverable until the user resolves the conflict');
});

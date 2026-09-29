import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudStore} from '../src/cloud-store.js';

function fixture(){
  const state={revision:0,rows:[],calls:[],fail:false,authError:false,uploads:[],downloads:0};
  const client={from(table){
    const filters={};const query={select(){return query;},eq(k,v){filters[k]=v;return query;},order(){return query;},
      async range(start,end){return {data:state.rows.slice(start,end+1).map(record=>({record}))};},
      async single(){return {data:{revision:state.revision}};},
      async maybeSingle(){return {data:state.rows.filter(r=>r.id===filters.id).map(record=>({record}))[0]||null};}};
    assert.ok(['shiye_records','shiye_revisions'].includes(table));return query;
  },storage:{from(bucket){assert.equal(bucket,'shiye-private');return {
    async upload(path,data,options){state.uploads.push({path,data,options});return {error:state.fail?{statusCode:500}:null};},
    async download(){state.downloads++;return {data:new Blob(['private image'])};}};}},
    async rpc(name,args){assert.equal(name,'shiye_commit');state.calls.push(args);if(state.fail||args.expected_revision!==state.revision)return {error:{message:'conflict'}};return {data:++state.revision};}
  };
  const db=createCloudStore({cloudClient:()=>client,requireCloudUser:async()=>{if(state.authError)throw Error('not authorized');return {id:'owner-uuid'};}});
  return {state,db};
}
test('cloud reads all pages, not just the server default first 1000 records',async()=>{
  const {state,db}=fixture();state.rows=Array.from({length:1001},(_,i)=>({id:String(i)}));
  assert.equal((await db.cloudAll('assets')).length,1001);
});
test('cloud transactions serialize revisions and recover after an error without local fallback',async()=>{
  const {state,db}=fixture();const put=()=>db.cloudTransaction(['assets'],tx=>tx.objectStore('assets').put({id:'a'}));
  await Promise.all([put(),put()]);assert.deepEqual(state.calls.map(c=>c.expected_revision),[0,1]);
  state.fail=true;await assert.rejects(put(),/conflict/);state.fail=false;await put();assert.equal(state.revision,3);
  state.revision++;await assert.rejects(put(),/conflict/);await assert.rejects(db.cloudCheckpoint(),/另一设备/);
});
test('private images upload before metadata and are never inline or overwritten',async()=>{
  const {state,db}=fixture();await db.cloudTransaction(['blobs'],tx=>tx.objectStore('blobs').put({id:'b',data:new Blob(['image'],{type:'image/png'})}));
  const upload=state.uploads[0],item=state.calls[0].operations[0].item;
  assert.match(upload.path,/^owner-uuid\/[a-f0-9]{64}$/);assert.equal(upload.options.upsert,false);assert.equal('data' in item,false);assert.equal(item.storagePath,upload.path);
  state.fail=true;const count=state.calls.length;await assert.rejects(db.cloudTransaction(['blobs'],tx=>tx.objectStore('blobs').put({id:'c',data:new Blob(['other'])})),/图片上传失败/);assert.equal(state.calls.length,count);
});
test('private image download cache and authorization failures are explicit',async()=>{
  const {state,db}=fixture();state.rows=[{id:'b',storagePath:'owner-uuid/hash'}];await db.cloudGet('blobs','b');await db.cloudGet('blobs','b');assert.equal(state.downloads,1);
  const denied=fixture();denied.state.authError=true;await assert.rejects(denied.db.cloudAll('assets'),/not authorized/);assert.equal(denied.state.calls.length,0);
});

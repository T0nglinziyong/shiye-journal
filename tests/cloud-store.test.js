import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudStore} from '../src/cloud-store.js';
import {projectBlobText} from '../src/project-document.js';

function fixture(cache=null){
  const state={revision:0,rows:[],calls:[],fail:false,authError:false,uploads:[],downloads:0};
  const client={from(table){
    const filters={};const query={select(){return query;},eq(k,v){filters[k]=v;return query;},order(){return query;},
      async range(start,end){state.reads=(state.reads||0)+1;return {data:state.rows.slice(start,end+1).map(record=>({record}))};},
      async single(){return {data:{revision:state.revision}};},
      async maybeSingle(){return {data:state.rows.filter(r=>r.id===filters.id).map(record=>({record}))[0]||null};}};
    if(table==='shiye_changes')return {select(){return this;},eq(){return this;},gt(){return this;},lte(){return this;},order(){return this;},async range(){return {error:{message:'change log not installed'}};}};
    assert.ok(['shiye_records','shiye_revisions'].includes(table));return query;
  },storage:{from(bucket){assert.equal(bucket,'shiye-private');return {
    async upload(path,data,options){state.uploads.push({path,data,options});return {error:state.fail?{statusCode:500}:null};},
    async download(path){state.downloads++;return {data:state.uploads.find(row=>row.path===path)?.data||new Blob(['private image'])};}};}},
    async rpc(name,args){assert.equal(name,'shiye_commit');state.calls.push(args);if(state.fail||args.expected_revision!==state.revision)return {error:{message:'conflict'}};return {data:++state.revision};}
  };
  const db=createCloudStore({cache,cloudClient:()=>client,requireCloudUser:async()=>{if(state.authError)throw Error('not authorized');return {id:'owner-uuid'};}});
  return {state,db};
}
test('cloud reads all pages, not just the server default first 1000 records',async()=>{
  const {state,db}=fixture();state.rows=Array.from({length:1001},(_,i)=>({id:String(i)}));
  assert.equal((await db.cloudAll('assets')).length,1001);
});
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
  const c=fixture(cache);c.state.rows=[{id:'blob',storagePath:'owner-uuid/hash'}];await c.db.cloudGet('blobs','blob');const d=fixture(cache);d.state.rows=c.state.rows;assert.equal(await (await d.db.cloudGet('blobs','blob')).data.text(),'private image');assert.equal(d.state.downloads,0);
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
  reopened.state.rows=[{id:'b',storagePath:'different-owner/hash'}];await assert.rejects(reopened.db.cloudGet('blobs','b'),/不属于当前账号/);
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
test('private thumbnails download without the original and reuse persistent hash cache',async()=>{
  const cache=memoryCache(),a=fixture(cache);a.state.rows=[{id:'b',storagePath:'owner-uuid/hash',thumbnailPath:'owner-uuid/hash-preview360.webp'}];
  await a.db.cloudPreview('b');assert.equal(a.state.downloads,1);
  const b=fixture(cache);b.state.rows=a.state.rows;await b.db.cloudPreview('b');assert.equal(b.state.downloads,0);
  const denied=fixture();denied.state.rows=[{id:'b',storagePath:'owner-uuid/hash',thumbnailPath:'other/hash-preview360.webp'}];await assert.rejects(denied.db.cloudPreview('b'),/缩略图不属于当前账号/);assert.equal(denied.state.downloads,0);
});
test('large works list only metadata; opening reuses the cached editable document and metadata edits preserve geometry',async()=>{
  const cache=memoryCache(),a=fixture(cache),full={id:'p',title:'before',activeDraftID:'d',drafts:[{id:'d',canvas:{width:100,height:100},items:[],textBlocks:[],strokes:[],makingSteps:[],primitives:Array.from({length:4000},(_,i)=>({id:String(i),kind:'vector',vectorLayers:[{fill:'#ff0000',rects:[[0,0,12,12]]}]}))}]};
  await a.db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put(full));const summary=a.state.calls[0].operations[0].item;a.state.rows=[summary];assert.ok(summary.projectDocumentPath);assert.equal(summary.drafts[0].primitives.length,0);
  assert.equal((await a.db.cloudAll('projects'))[0].drafts[0].primitives.length,0);assert.equal(a.state.downloads,0);
  const opened=await a.db.cloudGet('projects','p');assert.equal(opened.drafts[0].primitives.length,4000);assert.equal(a.state.downloads,0);assert.equal('projectDocumentPath' in opened,false);
  await a.db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put({...summary,title:'after'}));const last=a.state.uploads.at(-1),encoded=a.state.calls.at(-1).operations[0].item;const restored=JSON.parse(await projectBlobText(last.data,encoded.projectDocumentEncoding));assert.equal(restored.drafts[0].primitives.length,4000);assert.equal(restored.title,'after');assert.ok(last.data.size<JSON.stringify(full).length/10);
  a.state.fail=true;const count=a.state.calls.length;await assert.rejects(a.db.cloudTransaction(['projects'],tx=>tx.objectStore('projects').put({...opened,title:'failed'})),/完整数据上传失败/);assert.equal(a.state.calls.length,count);
  const denied=fixture();denied.state.rows=[{...summary,projectDocumentPath:'other/document'}];await assert.rejects(denied.db.cloudGet('projects','p'),/不属于当前账号/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudStore} from '../src/cloud-store.js';
import {prepareStorageMigration} from '../src/data-migrations/registry.js';
const legacy=()=>({id:'project-old',title:'旧作品',activeDraftID:'d',drafts:[{id:'d',canvas:{width:707,height:1000},pageMode:'single',physicalPageHeightMM:297,paperColor:'#ffffff',items:[],primitives:[],textBlocks:[],strokes:[]}]});
function server(cache=null){
 const state={revision:3,collections:{assets:[],series:[],projects:[legacy()],blobs:[{id:'source',storagePath:'owner/file',storageProvider:'cos'}],meta:[],trash:[]},calls:[]};
 const client={from(table){const f={};const q={select(){return q;},eq(k,v){f[k]=v;return q;},order(){return q;},async range(start,end){return {data:(state.collections[f.store]||[]).slice(start,end+1).map(record=>({record}))};},async single(){return {data:{revision:state.revision,account_epoch:'epoch-fixture'}};},async maybeSingle(){return {data:null}}};return q;},async rpc(name,args){assert.equal(name,'shiye_commit_v3_guarded');state.calls.push(args);if(args.base_revision!==state.revision)return {error:{message:'conflict'}};return {data:{status:'applied',revision:++state.revision,accountEpoch:'epoch-fixture',syncProtocolVersion:3}}}};
 const db=createCloudStore({cloudClient:()=>client,requireCloudUser:async()=>({id:'owner'}),cache});return {db,state};
}
test('account migration inspects all six stores, CAS-commits only validated obsolete records',async()=>{
 const {db,state}=server(),snapshot=await db.cloudMigrationInventory();
 assert.equal(snapshot.revision,3);assert.equal(snapshot.collections.blobs.length,1);
 const plan=await prepareStorageMigration(snapshot.collections,{assets:snapshot.collections.assets});
 assert.equal(plan.changes.length,1);
 const result=await db.cloudMigrationCommit({expectedRevision:snapshot.revision,changes:plan.changes});
 assert.equal(result.updated,1);
 assert.equal(state.calls.length,1);assert.equal(state.calls[0].base_revision,3);
 assert.deepEqual(state.calls[0].operations.map(op=>op.store),['projects']);
 assert.equal(state.calls[0].operations[0].item.drafts[0].sceneVersion,2);
 assert.equal(state.collections.projects[0].drafts[0].sceneVersion,undefined);
});
test('migration never overwrites a version advanced by another device after preview',async()=>{
 const {db,state}=server(),snapshot=await db.cloudMigrationInventory();
 const plan=await prepareStorageMigration(snapshot.collections);
 state.revision++;
 await assert.rejects(db.cloudMigrationCommit({expectedRevision:snapshot.revision,changes:plan.changes}),/版本已变化/);
 assert.equal(state.calls.length,0);
});
test('migration rejects arbitrary writes against assets, meta or photos',async()=>{
 const {db}=server();
 await assert.rejects(db.cloudMigrationCommit({expectedRevision:3,changes:[{id:'secret',store:'meta',converted:{id:'secret'}}]}),/写入目标不安全/);
});

test('migration stops before writing when an overlapping old scene is quarantined locally',async()=>{
 const invalid={record:{id:'project-old',drafts:[{id:'d',items:[],primitives:[],textBlocks:[],strokes:[]}]},serial:1,baseRevision:0};
 const cache={get:async(_account,key)=>key==='unified-outbox'?undefined:key==='project-outbox'?[invalid]:[],put:async()=>{}};
 const {db,state}=server(cache),snapshot=await db.cloudMigrationInventory();
 const plan=await prepareStorageMigration(snapshot.collections);
 await assert.rejects(db.cloudMigrationCommit({expectedRevision:snapshot.revision,changes:plan.changes}),/待同步操作与拟转换资料重叠/);
 assert.equal(state.calls.length,0);
});

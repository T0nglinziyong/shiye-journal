import test from 'node:test';
import assert from 'node:assert/strict';
import {changeTrash,expiredTrash,TRASH_RETENTION_MS} from '../src/trash-actions.js';

const now=Date.parse('2026-09-30T12:00:00Z');
const entry=(id,kind,date)=>({id,kind,date,item:{id:id+'-item',title:id}});
function fixture(rows){const state={assets:[],projects:[],trash:structuredClone(rows)},writes=[];const db={all:async()=>[],completeProject:async row=>row,async transaction(names,fn){const operations=[];fn({objectStore:store=>({put:item=>operations.push({store,action:'put',item}),delete:id=>operations.push({store,action:'delete',id})})});writes.push({names,operations});}};return {state,db,writes};}

test('thirty days is inclusive; unknown dates are never silently discarded',()=>{
  const rows=[entry('a','asset',new Date(now-TRASH_RETENTION_MS+1).toISOString()),entry('b','asset',new Date(now-TRASH_RETENTION_MS).toISOString()),entry('c','project','invalid')];
  assert.deepEqual(expiredTrash(rows,now).map(row=>row.id),['b']);
});
test('bulk recovery is one transaction and retains nonselected entries',async()=>{
  const {state,db,writes}=fixture([entry('a','asset','2026-09-30'),entry('p','project','2026-09-30'),entry('other','asset','2026-09-30')]);
  assert.equal(await changeTrash({db,state,ids:['a','p'],recover:true}),2);
  assert.deepEqual(writes[0].names,['assets','projects','trash','meta']);
  assert.equal(writes[0].operations.length,6);assert.equal(state.assets.length,1);assert.equal(state.projects.length,1);assert.deepEqual(state.trash.map(row=>row.id),['other']);
});
test('failure or abort preserves visible trash and never reports success',async()=>{
  const {state}=fixture([entry('a','asset','2026-09-30')]);
  const db={transaction:async()=>{throw new DOMException('request aborted','AbortError');}};
  await assert.rejects(changeTrash({db,state,ids:['a']}),{name:'AbortError'});
  assert.deepEqual(state.trash.map(row=>row.id),['a']);
});
test('bulk permanent removal only deletes trash records, not shared image bytes',async()=>{
  const {state,db,writes}=fixture([entry('a','asset','2026-09-30'),entry('p','project','2026-09-30')]);
  await changeTrash({db,state,ids:['a','p']});assert.deepEqual(writes[0].names,['trash']);
  assert.deepEqual(writes[0].operations.map(op=>op.id),['a','p']);assert.equal(state.trash.length,0);
});
test('permanently removing the last work also removes its hidden material and trash card',async()=>{
  const asset={id:'material',hiddenFromLibraryAt:'2026-09-20',isProjectInternal:true,blobId:'image'};
  const work={id:'work',drafts:[{items:[{assetID:asset.id}]}]};
  const {state,db,writes}=fixture([
    {id:'deleted-work',kind:'project',item:work,date:'2026-09-30'},
    {id:'deleted-material',kind:'asset',item:{id:asset.id,blobId:'image'},date:'2026-09-20'}
  ]);
  state.assets=[asset];
  await changeTrash({db,state,ids:['deleted-work']});
  assert.deepEqual(writes[0].operations.map(op=>[op.store,op.action,op.id]),[
    ['trash','delete','deleted-work'],['trash','delete','deleted-material'],['assets','delete','material']
  ]);
  assert.deepEqual(state.assets,[]);assert.deepEqual(state.trash,[]);
});
test('shared or visible materials survive permanent removal of one work',async()=>{
  const asset={id:'shared',hiddenFromLibraryAt:'2026-09-20',isProjectInternal:true};
  const visible={id:'library-material'};
  const work={id:'first',drafts:[{items:[{assetID:asset.id},{assetID:visible.id}]}]};
  const {state,db,writes}=fixture([
    {id:'deleted-work',kind:'project',item:work,date:'2026-09-30'},
    {id:'deleted-material',kind:'asset',item:{id:asset.id},date:'2026-09-20'}
  ]);
  state.assets=[asset,visible];
  db.all=async()=>[{id:'second',drafts:[{items:[{assetID:asset.id}]}]}];
  await changeTrash({db,state,ids:['deleted-work']});
  assert.deepEqual(writes[0].operations.map(op=>[op.store,op.action,op.id]),[['trash','delete','deleted-work']]);
  assert.deepEqual(state.assets,[asset,visible]);
  assert.deepEqual(state.trash.map(entry=>entry.id),['deleted-material']);
});
test('the last work removes a legacy trash-only material without reviving it',async()=>{
  const {state,db,writes}=fixture([
    {id:'deleted-work',kind:'project',item:{id:'work',drafts:[{items:[{assetID:'legacy'}]}]},date:'2026-09-30'},
    {id:'legacy-card',kind:'asset',item:{id:'legacy',blobId:'image'},date:'2026-09-20'}
  ]);
  await changeTrash({db,state,ids:['deleted-work']});
  assert.deepEqual(writes[0].operations.map(op=>[op.store,op.action,op.id]),[
    ['trash','delete','deleted-work'],['trash','delete','legacy-card']
  ]);
  assert.deepEqual(state.assets,[]);assert.deepEqual(state.trash,[]);
});
test('a pending edit defers linked material removal while the work can be removed',async()=>{
  const asset={id:'pending-material',hiddenFromLibraryAt:'2026-09-20',isProjectInternal:true};
  const {state,db,writes}=fixture([{id:'deleted-work',kind:'project',
    item:{id:'work',drafts:[{items:[{assetID:asset.id}]}]},date:'2026-09-30'}]);
  state.assets=[asset];db.pendingSyncDetails=async()=>({batches:[{id:'pending'}],quarantined:0});
  await changeTrash({db,state,ids:['deleted-work']});
  assert.deepEqual(writes[0].operations.map(op=>[op.store,op.action,op.id]),[['trash','delete','deleted-work']]);
  assert.deepEqual(state.assets,[asset]);
});

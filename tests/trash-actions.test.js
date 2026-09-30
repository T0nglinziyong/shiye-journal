import test from 'node:test';
import assert from 'node:assert/strict';
import {changeTrash,expiredTrash,TRASH_RETENTION_MS} from '../src/trash-actions.js';

const now=Date.parse('2026-09-30T12:00:00Z');
const entry=(id,kind,date)=>({id,kind,date,item:{id:id+'-item',title:id}});
function fixture(rows){const state={assets:[],projects:[],trash:structuredClone(rows)},writes=[];const db={async transaction(names,fn){const operations=[];fn({objectStore:store=>({put:item=>operations.push({store,action:'put',item}),delete:id=>operations.push({store,action:'delete',id})})});writes.push({names,operations});}};return {state,db,writes};}

test('seven days is inclusive; unknown dates are never silently discarded',()=>{
  const rows=[entry('a','asset',new Date(now-TRASH_RETENTION_MS+1).toISOString()),entry('b','asset',new Date(now-TRASH_RETENTION_MS).toISOString()),entry('c','project','invalid')];
  assert.deepEqual(expiredTrash(rows,now).map(row=>row.id),['b']);
});
test('bulk recovery is one transaction and retains nonselected entries',async()=>{
  const {state,db,writes}=fixture([entry('a','asset','2026-09-30'),entry('p','project','2026-09-30'),entry('other','asset','2026-09-30')]);
  assert.equal(await changeTrash({db,state,ids:['a','p'],recover:true}),2);
  assert.deepEqual(writes[0].names,['assets','projects','trash']);
  assert.equal(writes[0].operations.length,4);assert.equal(state.assets.length,1);assert.equal(state.projects.length,1);assert.deepEqual(state.trash.map(row=>row.id),['other']);
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

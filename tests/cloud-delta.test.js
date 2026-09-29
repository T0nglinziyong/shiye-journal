import test from 'node:test';
import assert from 'node:assert/strict';
import {readCloudDelta} from '../src/cloud-delta.js';
function fixture({logs,rows,revision=2}){
  const reads=[];const client={from(table){let store,ids;return {select(){return this;},eq(k,v){if(k==='store')store=v;return this;},gt(){return this;},lte(){return this;},order(){return this;},in(k,v){ids=v;return this;},async single(){return {data:{revision}};},async range(){if(table==='shiye_changes')return {data:logs};reads.push({store,ids});return {data:(rows[store]||[]).filter(r=>ids.includes(r.id)).map(record=>({record}))};}};}};
  const snapshots=new Map(['assets','series','projects','trash'].map(store=>[store,{revision:0,records:store==='assets'?[{id:'a',title:'old'},{id:'b'}]:[]} ]));
  return {client,owner:'owner',before:0,after:2,snapshots,reads};
}
test('delta fetches only final changed IDs and preserves unchanged collections',async()=>{
  const f=fixture({logs:[{revision:1,keys:[{store:'assets',id:'a',action:'put'}]},{revision:2,keys:[{store:'assets',id:'a',action:'put'},{store:'assets',id:'b',action:'delete'}]}],rows:{assets:[{id:'a',title:'latest'}]}});
  const result=await readCloudDelta(f);assert.deepEqual(f.reads,[{store:'assets',ids:['a']}]);assert.deepEqual(result.snapshots.get('assets').records,[{id:'a',title:'latest'}]);assert.equal(result.snapshots.get('series').revision,2);assert.deepEqual(result.blobIDs,[]);assert.equal(f.snapshots.get('assets').records[0].title,'old');
});
test('clear followed by put rebuilds just that store',async()=>{
  const f=fixture({logs:[{revision:1,keys:[{store:'assets',action:'clear'}]},{revision:2,keys:[{store:'assets',id:'c',action:'put'}]}],rows:{assets:[{id:'c'}]}});assert.deepEqual((await readCloudDelta(f)).snapshots.get('assets').records,[{id:'c'}]);
});
test('gaps, missing rows and a concurrent cloud revision reject the entire delta',async()=>{
  const logs=[{revision:1,keys:[]},{revision:2,keys:[{store:'assets',id:'a',action:'put'}]}];
  assert.equal(await readCloudDelta(fixture({logs:logs.slice(1),rows:{}})),null);
  assert.equal(await readCloudDelta(fixture({logs,rows:{}})),null);
  assert.equal(await readCloudDelta(fixture({logs,rows:{assets:[{id:'a'}]},revision:3})),null);
});

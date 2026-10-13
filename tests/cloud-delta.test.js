import test from 'node:test';
import assert from 'node:assert/strict';
import {readCloudDelta,canRebaseUnchangedKeys} from '../src/cloud-delta.js';
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
test('delta reads changed collections together and checks revision afterward',async()=>{
  const snapshots=new Map(['assets','series','projects','trash'].map(store=>[store,{revision:1,records:[]}]));
  const started=[];let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const keys=[{store:'assets',id:'a',action:'put'},{store:'projects',id:'p',action:'put'}];
  const client={from(table){let store;const q={select(){return q;},eq(k,v){if(k==='store')store=v;return q;},gt(){return q;},lte(){return q;},order(){return q;},in(){return q;},
    async range(){if(table==='shiye_changes')return {data:[{revision:2,keys}]};started.push(store);if(started.length===2)release();await gate;return {data:[{record:{id:store==='assets'?'a':'p'}}]};},
    async single(){return {data:{revision:2}};}};return q;}};
  const result=await readCloudDelta({client,owner:'owner',before:1,after:2,snapshots});
  assert.deepEqual(started,['assets','projects']);
  assert.ok(result);assert.equal(result.snapshots.get('projects').records[0].id,'p');
});
test('gaps, missing rows and a concurrent cloud revision reject the entire delta',async()=>{
  const logs=[{revision:1,keys:[]},{revision:2,keys:[{store:'assets',id:'a',action:'put'}]}];
  assert.equal(await readCloudDelta(fixture({logs:logs.slice(1),rows:{}})),null);
  assert.equal(await readCloudDelta(fixture({logs,rows:{}})),null);
  assert.equal(await readCloudDelta(fixture({logs,rows:{assets:[{id:'a'}]},revision:3})),null);
});
test('pending mutation rebases only over a complete disjoint change log',async()=>{
  const op=[{store:'trash',action:'delete',id:'mine'}];
  const args={client:fixture({logs:[{revision:1,keys:[{store:'assets',id:'other',action:'put'}]}],rows:{}}).client,owner:'owner',before:0,after:1,operations:op};
  assert.equal(await canRebaseUnchangedKeys(args),true);
  for(const key of [{store:'trash',id:'mine',action:'put'},{store:'trash',action:'clear'}]){
    const client=fixture({logs:[{revision:1,keys:[key]}],rows:{}}).client;
    assert.equal(await canRebaseUnchangedKeys({...args,client}),false);
  }
  assert.equal(await canRebaseUnchangedKeys({...args,client:fixture({logs:[],rows:{}}).client}),false);
});


function watermarkClient({start=721,keys=[]}={}){
  return {from(table){
    const where={};
    const q={
      select(){return q;},
      eq(name,value){where[name]=value;return q;},
      gt(name,value){where.after=value;return q;},
      in(name,value){where[name]=value;return q;},
      maybeSingle:async()=>table==='shiye_key_watermark_start'?{data:{start_revision:start},error:null}:{data:null,error:null},
      limit:async()=>({data:keys.filter(key=>key.store===where.store&&key.revision>where.after&&(!where.id||where.id.includes(key.id))).slice(0,1),error:null})
    };
    return q;
  }};
}
test('key watermarks allow disjoint updates beyond the 250-change history window',async()=>{
  const args={owner:'owner',before:722,after:1250,operations:[{store:'projects',action:'delete',id:'work-a'}]};
  assert.equal(await canRebaseUnchangedKeys({...args,client:watermarkClient({keys:[{store:'projects',id:'work-b',revision:1249}]})}),true);
  assert.equal(await canRebaseUnchangedKeys({...args,client:watermarkClient({keys:[{store:'projects',id:'work-a',revision:900}]})}),false);
  assert.equal(await canRebaseUnchangedKeys({...args,client:watermarkClient({keys:[{store:'projects',id:'*',revision:1100}]})}),false);
  assert.equal(await canRebaseUnchangedKeys({...args,before:700,client:watermarkClient()}),false,
    'History before watermark initialization is not silently assumed safe');
  assert.equal(await canRebaseUnchangedKeys({...args,operations:[{store:'projects',action:'clear'}],client:watermarkClient({keys:[{store:'projects',id:'work-b',revision:930}]})}),false);
});


test('delete and restore propagate atomically to other devices in every collection',async()=>{
  const old=new Map([
    ['assets',{revision:11,records:[{id:'asset-a',title:'to delete'},{id:'asset-b',title:'kept'}]}],
    ['projects',{revision:11,records:[{id:'work-a',title:'to delete'},{id:'work-b',title:'kept'}]}],
    ['series',{revision:11,records:[{id:'series-a',title:'kept'}]}],
    ['trash',{revision:11,records:[]}]
  ]);
  const keys=[
    {store:'assets',id:'asset-a',action:'delete'},
    {store:'projects',id:'work-a',action:'delete'},
    {store:'trash',id:'trash-asset',action:'put'},
    {store:'trash',id:'trash-work',action:'put'}
  ];
  const trashRecords=[{id:'trash-asset',kind:'asset',item:{id:'asset-a'},date:'2026-10-09T12:00:00Z'},
    {id:'trash-work',kind:'project',item:{id:'work-a'},date:'2026-10-09T12:00:00Z'}];
  const client={from(table){
    const filter={};const q={
      select(){return q;},eq(k,v){filter[k]=v;return q;},gt(){return q;},lte(){return q;},
      in(k,v){filter[k]=v;return q;},order(){return q;},
      range:async()=>{
        if(table==='shiye_changes')return {data:[{revision:12,keys}]};
        if(table==='shiye_records')return {data:(filter.store==='trash'?trashRecords:[])
          .filter(r=>filter.id?.includes(r.id)).map(record=>({record}))};
        throw Error('unexpected table '+table);
      },
      single:async()=>({data:{revision:12}})
    };return q;
  }};
  const result=await readCloudDelta({client,owner:'a',before:11,after:12,snapshots:old});
  assert.ok(result);
  assert.deepEqual(result.snapshots.get('assets').records.map(r=>r.id),['asset-b']);
  assert.deepEqual(result.snapshots.get('projects').records.map(r=>r.id),['work-b']);
  assert.deepEqual(result.snapshots.get('trash').records.map(r=>r.id),['trash-asset','trash-work']);
  assert.deepEqual(old.get('assets').records.map(r=>r.id),['asset-a','asset-b'],'input snapshot is never mutated');
});

test('permanent deletion of trash propagates even without a new put',async()=>{
  const keys=[{store:'trash',id:'removed-entry',action:'delete'}];
  const snapshots=new Map(['assets','series','projects','trash'].map(store=>[store,{
    revision:4,records:store==='trash'?[{id:'removed-entry',kind:'asset'},{id:'kept-entry',kind:'project'}]:[]
  }]));
  const client={from(table){const q={
    select(){return q;},eq(){return q;},gt(){return q;},lte(){return q;},order(){return q;},
    range:async()=>({data:table==='shiye_changes'?[{revision:5,keys}]:[]}),
    single:async()=>({data:{revision:5}})
  };return q;}};
  const result=await readCloudDelta({client,owner:'a',before:4,after:5,snapshots});
  assert.deepEqual(result.snapshots.get('trash').records.map(r=>r.id),['kept-entry']);
});

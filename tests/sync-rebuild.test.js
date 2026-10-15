import test from 'node:test';
import assert from 'node:assert/strict';
import {rebuildSyncRecords} from '../src/sync-rebuild.js';
import {createProjectSync} from '../src/project-sync.js';

test('retry rebuilds metadata from current local records while retaining image bytes and deletes',()=>{
  const image=new Blob(['original bytes']);
  const rows=[
    {record:{id:'project:p',kind:'project',payload:{id:'p',title:'old'}},serial:1},
    {record:{id:'batch:b',kind:'batch',payload:{id:'b',names:['assets','blobs','projects'],operations:[
      {store:'assets',action:'put',item:{id:'a',title:'old'}},
      {store:'blobs',action:'put',item:{id:'image',data:image}},
      {store:'projects',action:'delete',id:'gone'}]}},serial:2}
  ];
  const result=rebuildSyncRecords(rows,{projects:[{id:'p',title:'new'}],assets:[{id:'a',title:'current'}]});
  assert.equal(result[0].payload.title,'new');
  assert.equal(result[1].payload.operations[0].item.title,'current');
  assert.equal(result[1].payload.operations[1].item.data.size,image.size);
  assert.deepEqual(result[1].payload.operations[2],{store:'projects',action:'delete',id:'gone'});
  assert.equal(rows[0].record.payload.title,'old');
});

test('retry splits previously coalesced independent asset updates',()=>{
  const source=id=>({record:{id:`batch:${id}`,kind:'batch',payload:{id,names:['assets'],operations:[
    {store:'assets',action:'put',item:{id,title:'old'}}]}},serial:1});
  const rows=[{record:{id:'batch:merged',kind:'batch',payload:{id:'merged',coalescedRows:[source('a'),source('b')],names:['assets'],operations:[]}},serial:2}];
  const result=rebuildSyncRecords(rows,{assets:[{id:'a',title:'new a'},{id:'b',title:'new b'}]});
  assert.deepEqual(result.map(row=>row.id),['batch:a','batch:b']);
  assert.deepEqual(result.map(row=>row.payload.operations[0].item.title),['new a','new b']);
});

test('rebuild replaces all old operation IDs at one fresh revision and uploads them',async()=>{
  let disk=[{record:{id:'a',title:'old'},serial:1,baseRevision:1,operationID:'old-a'},
    {record:{id:'b',title:'old'},serial:2,baseRevision:1,operationID:'old-b'}];
  let revision=5;const uploaded=[];
  const sync=createProjectSync({load:async()=>structuredClone(disk),reload:async()=>structuredClone(disk),
    write:async rows=>{disk=structuredClone(rows);},revision:()=>revision,
    commit:async record=>{uploaded.push(record);revision++;},reconcile:async()=> 'rebase'});
  const result=await sync.rebuild(rows=>({records:rows.map(row=>({...row.record,title:'current'})),baseRevision:revision}));
  assert.deepEqual(result,{replaced:2,pending:2});
  assert.ok(disk.every(row=>row.baseRevision===5&&!row.operationID.startsWith('old-')));
  await sync.flush();
  assert.deepEqual(uploaded.map(row=>row.title),['current','current']);
  assert.deepEqual(disk,[]);
});

test('failed atomic replacement leaves the old durable queue available',async()=>{
  const initial=[{record:{id:'draft',title:'old'},serial:1,baseRevision:2,operationID:'old'}];
  let disk=structuredClone(initial),fail=true;
  const sync=createProjectSync({load:async()=>structuredClone(disk),reload:async()=>structuredClone(disk),
    write:async rows=>{if(fail)throw Error('disk full');disk=structuredClone(rows);},
    revision:()=>4,commit:async()=>{}});
  await assert.rejects(sync.rebuild(()=>({records:[{id:'draft',title:'new'}],baseRevision:4})),/disk full/);
  assert.deepEqual(disk,initial);
  assert.equal((await sync.pending())[0].record.title,'old');
  fail=false;
  await sync.rebuild(()=>({records:[{id:'draft',title:'new'}],baseRevision:4}));
  assert.equal(disk[0].record.title,'new');
});

test('an edit staged during rebuild remains queued after the replacement',async()=>{
  let disk=[{record:{id:'first'},serial:1,baseRevision:1,operationID:'old'}];
  let release;const wait=new Promise(resolve=>release=resolve);
  const sync=createProjectSync({load:async()=>structuredClone(disk),reload:async()=>structuredClone(disk),
    write:async rows=>{disk=structuredClone(rows);},revision:()=>4,commit:async()=>{},
    autoFlushDelayMs:100000,setTimer:()=>0,clearTimer:()=>{}});
  const rebuilding=sync.rebuild(async rows=>{await wait;return {records:rows.map(row=>row.record),baseRevision:4};});
  const staging=sync.stage({id:'second'});
  release();await rebuilding;await staging;
  assert.deepEqual(disk.map(row=>row.record.id),['first','second']);
});

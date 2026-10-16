import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectSync} from '../src/project-sync.js';
import {planMetadataBatch,splitMetadataBatch} from '../src/sync-metadata-batch.js';
import {syncEnvelope,syncAffectedKeys,repairMiswrappedSyncRows} from '../src/unified-sync-outbox.js';

const asset=id=>syncEnvelope('batch',{id:'edit-'+id,names:['assets'],operations:[
  {store:'assets',action:'put',item:{id,title:'updated-'+id}}
]});
const queue=({commit,reconcile=async()=> 'rebase'}={})=>{
  let disk=[],revision=0;
  const sync=createProjectSync({load:async()=>structuredClone(disk),reload:async()=>structuredClone(disk),
    write:async rows=>{disk=structuredClone(rows);},revision:()=>revision,
    commit:async(record,operationID)=>{await commit?.(record,operationID);revision++;},
    reconcile,recordKeys:syncAffectedKeys,coalesce:planMetadataBatch,
    splitCoalesced:splitMetadataBatch,autoFlushDelayMs:10000});
  return {sync,get disk(){return disk;},get revision(){return revision;}};
};

test('a previously persisted batch without its envelope is restored without changing its operation ID',()=>{
  const original=asset('a').payload;
  const row={record:structuredClone(original),serial:3,baseRevision:2048,operationID:'same-operation'};
  const repaired=repairMiswrappedSyncRows([row]);
  assert.deepEqual(repaired[0].record,syncEnvelope('batch',original));
  assert.equal(repaired[0].operationID,row.operationID);
  assert.equal(repaired[0].baseRevision,2048);
  assert.equal(repairMiswrappedSyncRows(repaired),null);
});

test('malformed reconciliation cannot replace a durable batch or block an unrelated record',async()=>{
  const calls=[];let disk=[],revision=5;
  const sync=createProjectSync({load:async()=>structuredClone(disk),reload:async()=>structuredClone(disk),
    write:async rows=>{disk=structuredClone(rows);},revision:()=>revision,
    recordKeys:syncAffectedKeys,coalesce:()=>null,autoFlushDelayMs:10000,
    reconcile:async record=>record.payload.operations[0].item.id==='a'
      ?{kind:'replace',record:record.payload}:'rebase',
    commit:async record=>{calls.push(record.payload.operations[0].item.id);revision++;}});
  await sync.stage(asset('a'),{baseRevision:4});
  await sync.stage(asset('b'),{baseRevision:4});
  await assert.rejects(sync.flush(),/同步合并结果不完整/);
  assert.deepEqual(calls,['b']);
  assert.equal(disk.length,1);
  assert.equal(disk[0].record.kind,'batch');
  assert.equal(disk[0].record.payload.operations[0].item.id,'a');
});

test('reconciliation cannot replace one queued batch with another batch ID',async()=>{
  let disk=[],revision=5;
  const sync=createProjectSync({load:async()=>structuredClone(disk),reload:async()=>structuredClone(disk),
    write:async rows=>{disk=structuredClone(rows);},revision:()=>revision,
    recordKeys:syncAffectedKeys,coalesce:()=>null,autoFlushDelayMs:10000,
    reconcile:async record=>({kind:'replace',record:{...record,id:'other-queue-id'}}),
    commit:async()=>{revision++;}});
  await sync.stage(asset('a'),{baseRevision:4});
  await assert.rejects(sync.flush(),/同步合并结果不完整/);
  assert.equal(disk.length,1);
  assert.equal(disk[0].record.id,asset('a').id);
});

test('independent asset metadata edits commit in one durable RPC operation',async()=>{
  const calls=[],fixture=queue({commit:async record=>calls.push(record)});
  await fixture.sync.stage(asset('a'));
  await fixture.sync.stage(asset('b'));
  await fixture.sync.stage(asset('c'));
  await fixture.sync.flush();
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].payload.operations.map(op=>op.item.id),['a','b','c']);
  assert.equal(fixture.revision,1);
  assert.deepEqual(fixture.disk,[]);
});

test('a large set of independent metadata edits is split into bounded commits',()=>{
  const rows=Array.from({length:8},(_,index)=>({record:asset(String(index)),
    serial:index+1,baseRevision:0,operationID:'op-'+index}));
  const first=planMetadataBatch(rows,0,Infinity);
  assert.deepEqual(first.record.payload.operations.map(op=>op.item.id),['0','1','2','3']);
  const remaining=rows.filter(row=>!first.sourceRows.includes(row));
  const second=planMetadataBatch(remaining,0,Infinity);
  assert.deepEqual(second.record.payload.operations.map(op=>op.item.id),['4','5','6','7']);
});

test('a lost acknowledgement of the merged operation is checked before retry',async()=>{
  const calls=[];let revision=0,disk=[];
  const sync=createProjectSync({load:async()=>structuredClone(disk),reload:async()=>structuredClone(disk),
    write:async rows=>{disk=structuredClone(rows);},revision:()=>revision,
    commit:async(record,id)=>{calls.push(id);revision++;throw Error('reply lost');},
    reconcile:async(record)=>record.payload?.coalescedRows?'committed':'rebase',
    recordKeys:syncAffectedKeys,coalesce:planMetadataBatch,
    splitCoalesced:splitMetadataBatch,autoFlushDelayMs:10000});
  await sync.stage(asset('a'));await sync.stage(asset('b'));
  await sync.flush();
  assert.equal(calls.length,1);
  assert.equal(revision,1);
  assert.deepEqual(disk,[]);
});

test('reopening after an unknown merged reply reuses the persisted operation ID',async()=>{
  let revision=0,disk=[],committedID,attempts=0;
  const make=(reconcile)=>createProjectSync({load:async()=>structuredClone(disk),
    reload:async()=>structuredClone(disk),write:async rows=>{disk=structuredClone(rows);},
    revision:()=>revision,commit:async(_record,id)=>{
      attempts++;committedID=id;revision++;throw Error('reply lost');
    },reconcile,recordKeys:syncAffectedKeys,coalesce:planMetadataBatch,
    splitCoalesced:splitMetadataBatch,autoFlushDelayMs:10000});
  const first=make(async()=>{throw Error('offline verification');});
  await first.stage(asset('a'));await first.stage(asset('b'));
  await assert.rejects(first.flush(),/reply lost/);
  assert.equal(disk.length,1);
  assert.equal(disk[0].operationID,committedID);
  const reopened=make(async(_record,id)=>id===committedID?'committed':'conflict');
  await reopened.flush();
  assert.equal(attempts,1);
  assert.deepEqual(disk,[]);
});

test('a real grouped conflict splits back into independent durable edits',async()=>{
  const calls=[],fixture=queue({commit:async record=>{
    const ids=record.payload.operations.map(op=>op.item.id);
    calls.push(ids);
    if(record.payload.coalescedRows||ids.includes('b'))throw Error('conflict');
  },reconcile:async record=>record.payload?.coalescedRows||record.payload?.operations?.[0]?.item?.id==='b'?'conflict':'rebase'});
  await fixture.sync.stage(asset('a'));await fixture.sync.stage(asset('b'));await fixture.sync.stage(asset('c'));
  await fixture.sync.flush();
  assert.deepEqual(calls,[['a','b','c'],['a'],['c']]);
  assert.deepEqual(fixture.disk.map(row=>row.record.payload.operations[0].item.id),['b']);
  assert.equal(fixture.sync.status().conflicts,1);
});

test('deletes, image bytes, repeated asset IDs and work documents are never grouped',()=>{
  const wrap=(record,serial)=>({record,serial,baseRevision:0,operationID:'op-'+serial});
  const deletion=syncEnvelope('batch',{id:'del',names:['assets'],operations:[{store:'assets',action:'delete',id:'x'}]});
  const image=syncEnvelope('batch',{id:'image',names:['blobs'],operations:[{store:'blobs',action:'put',item:{id:'x',data:new Blob(['x'])}}]});
  const work=syncEnvelope('project',{id:'work',drafts:[]});
  assert.equal(planMetadataBatch([wrap(asset('a'),1),wrap(deletion,2),wrap(asset('b'),3)],0,Infinity),null);
  assert.equal(planMetadataBatch([wrap(asset('a'),1),wrap(image,2),wrap(asset('b'),3)],0,Infinity),null);
  assert.equal(planMetadataBatch([wrap(asset('a'),1),wrap(work,2),wrap(asset('b'),3)],0,Infinity),null);
  assert.equal(planMetadataBatch([wrap(asset('a'),1),wrap(asset('a'),2)],0,Infinity),null);
});

test('unchanged Blob rows are reused during later local staging',async()=>{
  let disk=[],firstSnapshot,secondSnapshot;
  const sync=createProjectSync({load:async()=>disk,write:async rows=>{
    if(!firstSnapshot)firstSnapshot=rows;else secondSnapshot=rows;
    disk=rows;
  },revision:()=>0,commit:async()=>{},autoFlushDelayMs:10000});
  await sync.stage({id:'first',data:new Blob([new Uint8Array(1024)])});
  await sync.stage({id:'second',data:new Blob([new Uint8Array(1024)])});
  assert.strictEqual(secondSnapshot[0],firstSnapshot[0]);
  assert.notStrictEqual(secondSnapshot[1],firstSnapshot[0]);
});

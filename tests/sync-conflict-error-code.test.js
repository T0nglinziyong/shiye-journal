import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProjectSync} from '../src/project-sync.js';
import {createSyncDiagnostics} from '../src/sync-diagnostics.js';

test('business CAS conflicts do not invoke PostgREST serialization retries',async()=>{
  for(const file of ['guarded-v3-commit.sql','record-cas-v3.sql']){
    const sql=await readFile(new URL('../deploy/supabase/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(sql,/errcode\s*=\s*'40001'/i);
    assert.match(sql,/errcode\s*=\s*'PT409'/i);
  }
});
test('HTTP business conflict is retained once while independent records commit',async()=>{
  let disk=[],revision=1;const calls=[];
  const error=Object.assign(Error('此记录已由另一设备修改'),{code:'PT409'});
  const sync=createProjectSync({load:async()=>structuredClone(disk),
    write:async rows=>{disk=structuredClone(rows);},revision:()=>revision,
    authoritativeCommit:true,reconcile:async()=> 'conflict',
    commit:async record=>{calls.push(record.id);if(record.id==='blocked')throw error;revision++;}});
  await sync.stageMany([{id:'blocked'},{id:'independent'}]);
  await assert.rejects(sync.flush(),/此记录/);
  assert.deepEqual(calls,['blocked','independent']);
  assert.equal(disk.length,1);assert.equal(disk[0].lastFailureClass,'conflict');
  const trace=createSyncDiagnostics();
  trace.record({action:'failed',kind:'batch',error});
  assert.equal(trace.report().events[0].failure.category,'revision-conflict');
});

test('automatic conflict policy resumes persisted batches and backs off instead of requiring manual review',async()=>{
  let disk=[{record:{id:'old',kind:'batch'},serial:1,operationID:'old-op',baseRevision:1,lastFailureClass:'conflict'}];
  let rejectOld=true,revision=2,now=1000;const calls=[];
  const sync=createProjectSync({load:async()=>structuredClone(disk),
    write:async rows=>{disk=structuredClone(rows);},revision:()=>revision,clock:()=>now,
    retryConflicts:record=>record.kind==='batch',authoritativeCommit:true,
    reconcile:async()=> 'conflict',
    commit:async record=>{calls.push(record.id);if(record.id==='old'&&rejectOld)throw Object.assign(Error('changed'),{code:'PT409'});revision++;}});
  await sync.stage({id:'independent',kind:'batch'});
  await assert.rejects(sync.flush(),/changed/);
  assert.ok(calls.includes('independent'));assert.ok(calls.includes('old'));
  assert.equal(sync.status().conflicts,0);
  assert.equal(disk.length,1);assert.equal(disk[0].lastFailureClass,'transient');
  assert.ok(disk[0].nextAttemptAt>now);
  rejectOld=false;now=disk[0].nextAttemptAt+1;
  await sync.flush();assert.equal(disk.length,0);
});

test('a failed automatic retry stays in queue without an unhandled promise rejection',async()=>{
  let disk=[],fire;
  const sync=createProjectSync({load:async()=>disk,write:async rows=>{disk=rows;},revision:()=>1,
    authoritativeCommit:true,retryConflicts:()=>true,reconcile:async()=> 'conflict',
    setTimer:fn=>{fire=fn;return 1;},clearTimer:()=>{},
    commit:async()=>{throw Object.assign(Error('changed'),{code:'PT409'});}});
  await sync.stage({id:'one',kind:'batch'});await Promise.resolve();
  assert.equal(typeof fire,'function');fire();
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(sync.status().pending,1);assert.equal(sync.status().conflicts,0);
  assert.equal(disk[0].lastFailureClass,'transient');
});

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

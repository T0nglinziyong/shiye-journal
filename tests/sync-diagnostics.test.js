import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyncDiagnostics} from '../src/sync-diagnostics.js';

test('sync diagnostic report keeps useful phases and revisions without private payloads',()=>{
  const trace=createSyncDiagnostics({limit:2,clock:()=> '2026-10-13T12:00:00.000Z'});
  const secret='sk-private-DO-NOT-EXPORT',title='私人作品名称';
  trace.record({action:'start',kind:'project',baseRevision:3,cloudRevision:4,pending:2,
    record:{id:'private-id',title}});
  const error=Object.assign(Error(`Failed to fetch https://secret.example/${secret}/${title}`),{
    name:'TypeError',status:503,code:'PGRST301',syncPhase:'云端提交事务',token:secret});
  trace.record({action:'failed',kind:'batch',baseRevision:3,cloudRevision:4,pending:2,error});
  trace.record({action:'retry',kind:'batch',baseRevision:4,cloudRevision:4,pending:1});
  const report=trace.report({pending:1,conflicts:0,revision:4,writesInFlight:0,quarantined:0,online:false});
  assert.equal(report.events.length,2);
  assert.deepEqual(report.events[0].failure,{category:'server',name:'TypeError',status:503,
    code:'PGRST301',phase:'云端提交事务',causeCategory:null});
  assert.equal(report.state.online,false);
  const serialized=JSON.stringify(report);
  for(const privateText of [secret,title,'secret.example','private-id'])assert.ok(!serialized.includes(privateText));
});

test('unconfirmed response retains its safe root cause category',()=>{
  const trace=createSyncDiagnostics();
  trace.record({action:'failed',kind:'project',error:new Error('云端版本未变化',{cause:Error('conflict')})});
  assert.equal(trace.report().events[0].failure.category,'unconfirmed-response');
  assert.equal(trace.report().events[0].failure.causeCategory,'revision-conflict');
});

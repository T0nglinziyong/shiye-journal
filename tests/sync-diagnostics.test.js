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

test('native iPhone image read errors retain a safe name and upload phase',()=>{
  const trace=createSyncDiagnostics();
  const error=Object.assign(new Error('private image path'),{
    name:'NotReadableError',syncPhase:'编码与上传 blobs'});
  trace.record({action:'failed',kind:'batch',error});
  const report=trace.report();
  assert.equal(report.events[0].failure.name,'NotReadableError');
  assert.equal(report.events[0].failure.category,'image-upload');
  assert.ok(!JSON.stringify(report).includes('private image path'));
});

test('active upload report shows elapsed phase and bounded counts without identifiers',()=>{
  const trace=createSyncDiagnostics();
  const report=trace.report({pending:1,uploading:true,active:{phase:'编码与上传',done:6,total:18,elapsedMs:32000,id:'private-id'}});
  assert.deepEqual(report.active,{phase:'编码与上传',completed:6,total:18,elapsedMs:32000});
  assert.ok(!JSON.stringify(report).includes('private-id'));
});


test('today trace survives a reopened app and excludes other days and private values',()=>{
  const rows=new Map(),storage={get length(){return rows.size;},key:i=>[...rows.keys()][i]||null,
    getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
  const first=createSyncDiagnostics({clock:()=> '2026-10-15T10:00:00.000+08:00',storage});
  first.record({action:'failed',kind:'batch',pending:13,error:Error('private title and api key')});
  first.report();
  const earlier=createSyncDiagnostics({clock:()=> '2026-10-14T10:00:00.000+08:00',storage});
  earlier.record({action:'start',kind:'project',pending:1});earlier.report();
  const reopened=createSyncDiagnostics({clock:()=> '2026-10-15T11:00:00.000+08:00',storage});
  reopened.record({action:'main-thread-lag',kind:'queue',durationMs:2430});
  const report=reopened.report({pending:13});
  assert.equal(report.events.length,2);
  assert.equal(report.sessionCount,2);
  assert.equal(report.events[1].durationMs,2430);
  assert.ok(!JSON.stringify(report).includes('private title'));
});

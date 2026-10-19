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
    code:'PGRST301',phase:'云端提交事务',causeCategory:null,causeStatus:null,
    causeCode:null,rpcDurationMs:null});
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

test('unconfirmed response preserves safe Supabase timeout details from its cause',()=>{
  const trace=createSyncDiagnostics({storage:null});
  const cause=Object.assign(Error('private SQL text'),{
    code:'57014',status:504,rpcDurationMs:8012});
  trace.record({action:'failed',kind:'batch',error:new Error('云端版本未变化',{cause})});
  const detail=trace.report().events[0].failure;
  assert.equal(detail.category,'unconfirmed-response');
  assert.equal(detail.causeCategory,'database-timeout');
  assert.equal(detail.causeStatus,504);
  assert.equal(detail.causeCode,'57014');
  assert.equal(detail.rpcDurationMs,8012);
  assert.ok(!JSON.stringify(trace.report()).includes('private SQL text'));
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


test('rolling 24-hour trace survives a reopened app and expires older sessions',()=>{
  const rows=new Map(),storage={get length(){return rows.size;},key:i=>[...rows.keys()][i]||null,
    getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
  const first=createSyncDiagnostics({clock:()=> '2026-10-15T10:00:00.000+08:00',storage});
  first.record({action:'failed',kind:'batch',pending:13,error:Error('private title and api key')});
  first.report();
  const earlier=createSyncDiagnostics({clock:()=> '2026-10-14T10:00:00.000+08:00',storage});
  earlier.record({action:'start',kind:'project',pending:1});earlier.report();
  const yesterday=createSyncDiagnostics({clock:()=> '2026-10-14T12:00:00.000+08:00',storage});
  yesterday.record({action:'retry',kind:'project',pending:2});yesterday.report();
  const reopened=createSyncDiagnostics({clock:()=> '2026-10-15T11:00:00.000+08:00',storage});
  reopened.record({action:'main-thread-lag',kind:'queue',durationMs:2430});
  const report=reopened.report({pending:13});
  assert.equal(report.events.length,3);
  assert.equal(report.sessionCount,3);
  assert.equal(report.events.at(-1).durationMs,2430);
  assert.ok(report.events.some(event=>event.action==='retry'));
  assert.ok(!report.events.some(event=>event.action==='start'));
  assert.equal([...rows.values()].some(value=>value.includes('"action":"start"')),false);
  assert.ok(!JSON.stringify(report).includes('private title'));
});

test('high-volume trace caps per-session storage and export size',()=>{
  const rows=new Map(),storage={get length(){return rows.size;},key:i=>[...rows.keys()][i]||null,
    getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
  const trace=createSyncDiagnostics({clock:()=> '2026-10-15T11:00:00.000+08:00',storage});
  for(let i=0;i<620;i++)trace.record({action:'prepare-start',pending:i});
  const report=trace.report();
  assert.equal(report.eventCount,500);
  assert.equal(JSON.parse([...rows.values()][0]).length,500);
});

test('upload diagnosis retains progress and request ID but discards URL and object identity',()=>{
  const trace=createSyncDiagnostics({storage:null});
  trace.record({action:'cos-put-failed',kind:'image',error:Object.assign(Error('secret'),{name:'TimeoutError'}),
    transfer:{bytes:12000,loaded:8000,phase:'uploading',status:503,requestId:'safe-request-id',url:'signed-secret',path:'private-path'}});
  const report=trace.report(),event=report.events[0];
  assert.equal(event.failure.name,'TimeoutError');
  assert.deepEqual(event.transfer,{bytes:12000,loaded:8000,phase:'uploading',status:503,requestId:'safe-request-id'});
  assert.ok(!JSON.stringify(report).includes('signed-secret'));
  assert.ok(!JSON.stringify(report).includes('private-path'));
});


test('CloudBase and COS response codes and request IDs survive a safe v3 export',()=>{
 const trace=createSyncDiagnostics({storage:null});
 trace.record({action:'failed',kind:'batch',error:Object.assign(Error('private url with signed token'),{
  status:413,code:'SHIYE_METADATA_INVALID',syncPhase:'编码与上传 trash',requestId:'api-123'})});
 trace.record({action:'cos-put-failed',kind:'image',error:Object.assign(Error('https://private.example?token=secret'),{
  code:'SHIYE_COS_NO_RESPONSE',name:'NetworkError',requestId:'cos-321'})});
 const report=trace.report();
 assert.equal(report.version,3);assert.equal(report.diagnosticBuild,'cloudbase-error-evidence-v3');
 assert.equal(report.events[0].failure.category,'oversize');
 assert.equal(report.events[0].failure.requestId,'api-123');
 assert.equal(report.events[1].failure.category,'image-upload');
 assert.equal(report.events[1].failure.code,'SHIYE_COS_NO_RESPONSE');
 assert.ok(!JSON.stringify(report).includes('private.example'));trace.dispose();
});

test('recent visible sync error is listed separately in diagnostic report',()=>{
 const trace=createSyncDiagnostics({storage:null});
 trace.record({action:'displayed',kind:'queue',error:Object.assign(Error('secret title'),{status:403,code:'OPERATION_FORBIDDEN',requestId:'sdk-123'})});
 const report=trace.report();assert.equal(report.lastDisplayedFailure.failure.requestId,'sdk-123');
 assert.equal(report.lastDisplayedFailure.failure.category,'authorization');
 assert.ok(!JSON.stringify(report).includes('secret title'));trace.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {recordRuntimeIssue,runtimeIssueReport,runtimeIssueSnapshot,clearRuntimeIssues} from '../src/runtime-diagnostics.js';
test('runtime diagnostics never collect user text, keys, or error messages',()=>{
 clearRuntimeIssues();
 const message='SECRET_KEY-should-never-enter-log';
 recordRuntimeIssue('error',new Error(message),'editor');
 const report=runtimeIssueReport();
 assert.ok(report.includes('"route": "editor"'));
 assert.ok(report.includes('"code": "Error"'));
 assert.ok(!report.includes(message));
});
test('known import variables and Blob decoding failures have actionable safe categories',()=>{
 clearRuntimeIssues();
 recordRuntimeIssue('handled',new ReferenceError("Can't find variable: supportsVision"),'import',{phase:'import'});
 recordRuntimeIssue('handled',new TypeError('Blob image decode failed: private photo'),'editor',{phase:'save'});
 const [variable,image]=runtimeIssueSnapshot().records;
 assert.equal(variable.reason,'undefined-variable');assert.equal(variable.symbol,'supportsVision');
 assert.equal(image.reason,'image-read-or-decode');assert.equal(image.symbol,null);
 assert.ok(!runtimeIssueReport().includes('private photo'));
 clearRuntimeIssues();
});
test('model payment failures retain only status and a safe category',()=>{
 clearRuntimeIssues();
 const error=Object.assign(new Error('private prompt and sk-should-never-enter-log'),{status:402,code:'balance'});
 recordRuntimeIssue('handled',error,'library',{phase:'ai'});
 const [record]=runtimeIssueSnapshot().records;
 assert.equal(record.phase,'ai');assert.equal(record.httpStatus,402);assert.equal(record.reason,'balance');
 assert.ok(!runtimeIssueReport().includes('private prompt'));
 clearRuntimeIssues();
});
test('redacted failure categories survive a simulated refresh without private content',async()=>{
 const previous=globalThis.localStorage,storage=new Map();
 globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 try{
  clearRuntimeIssues();
  recordRuntimeIssue('handled',new Error('private scene text sk-secret'),'editor',{phase:'save'});
  const fresh=await import('../src/runtime-diagnostics.js?refresh-test');
  const snapshot=fresh.runtimeIssueSnapshot();
  assert.equal(snapshot.records.length,1);
  assert.equal(snapshot.records[0].phase,'save');
  assert.equal(snapshot.dataSchemaVersion,1);
  assert.ok(!fresh.runtimeIssueReport().includes('private scene text'));
  assert.ok(![...storage.values()].join('').includes('sk-secret'));
  fresh.clearRuntimeIssues();clearRuntimeIssues();
 }finally{globalThis.localStorage=previous;}
});

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

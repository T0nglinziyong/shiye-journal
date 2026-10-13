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

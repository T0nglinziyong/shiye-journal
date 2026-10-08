import test from 'node:test';
import assert from 'node:assert/strict';
import {recordRuntimeIssue,runtimeIssueReport} from '../src/runtime-diagnostics.js';
test('runtime diagnostics never collect user text, keys, or error messages',()=>{
 const message='SECRET_KEY-should-never-enter-log';
 recordRuntimeIssue('error',new Error(message),'editor');
 const report=runtimeIssueReport();
 assert.ok(report.includes('"route": "editor"'));
 assert.ok(report.includes('"code": "Error"'));
 assert.ok(!report.includes(message));
});

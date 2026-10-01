import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {createNativeProjectPackage,importNativeProjectPackage} from '../src/native-project-package.js';
import {importEditableWorkPackage} from '../src/offline-creation.js';
import {project,draft} from '../src/domain.js';
import {captureHistory,restoreHistoryDraft} from '../src/project-history.js';

const bytes=async blob=>new Uint8Array(await blob.arrayBuffer());

test('I-03: ambiguous scene entries and traversal paths reject before import',()=>{
  const p=project('合成作品');
  const native=strToU8(JSON.stringify({format:'shiye-native-project',version:1,project:p}));
  const editable=strToU8('{}');
  assert.throws(()=>importEditableWorkPackage(zipSync({'native.shiyeproject.json':native,'project.shiyeproject.json':editable}),[]),/两个场景入口/);
  assert.throws(()=>importNativeProjectPackage(zipSync({'../escape.txt':strToU8('bad'),'native.shiyeproject.json':native}),[]),/危险路径/);
});

test('I-04: second active draft and immutable history survive ID remapping',async()=>{
  const p=project('两种方案');
  const second=draft();second.textBlocks.push({id:'text-second',content:'第二方案',x:100,y:100,width:180,height:100});
  p.drafts.push(second);p.activeDraftID=second.id;
  captureHistory(p);
  second.textBlocks[0].content='已经编辑';
  const restored=importNativeProjectPackage(await bytes(createNativeProjectPackage(p)),[]);
  assert.equal(restored.drafts.length,2);
  assert.equal(restored.activeDraftID,restored.drafts[1].id);
  assert.notEqual(restored.drafts[1].id,second.id);
  assert.notEqual(restored.drafts[1].textBlocks[0].id,'text-second');
  assert.ok(restored.draftHistorySnapshots[restored.activeDraftID]);
  restoreHistoryDraft(restored,restored.activeDraftID);
  assert.equal(restored.drafts[1].textBlocks[0].content,'第二方案');
});

test('I-01/I-02: external IDs are rebuilt and invalid geometry is rejected',async()=>{
  const p=project('安全文本 <3');
  p.drafts[0].textBlocks.push({id:'x" onclick="alert(1)',content:'A < B',x:50,y:60,width:100,height:40});
  const imported=importNativeProjectPackage(await bytes(createNativeProjectPackage(p)),[]);
  assert.equal(imported.drafts[0].textBlocks[0].content,'A < B');
  assert.match(imported.drafts[0].textBlocks[0].id,/^[a-f0-9-]{36}$/i);
  p.drafts[0].textBlocks[0].width=-1;
  assert.throws(()=>importNativeProjectPackage(zipSync({'native.shiyeproject.json':strToU8(JSON.stringify({format:'shiye-native-project',version:1,project:p}))}),[]),/几何/);
});

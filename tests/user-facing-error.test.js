import test from 'node:test';
import assert from 'node:assert/strict';
import {explainUserError} from '../src/user-facing-error.js';

test('browser runtime errors become actionable Chinese messages',()=>{
  for(const message of ["Can't find variable: supportsVision",'blob:abc resource not found','WebAssembly.instantiate(): expected magic word 00 61 73 6d']){
    const text=explainUserError(new Error(message),'导入素材');
    assert.match(text,/导入素材/);
    assert.doesNotMatch(text,/supportsVision|blob:|WebAssembly|magic word/);
  }
});
test('IndexedDB outbox abort is not mislabeled as a damaged image',()=>{
  const error=new DOMException('Blob transaction aborted','AbortError');
  error.syncPhase='写入本机待同步队列';
  const text=explainUserError(error,'素材自动整理');
  assert.match(text,/本机待同步资料写入中断/);
  assert.doesNotMatch(text,/图片读取或解码失败/);
});

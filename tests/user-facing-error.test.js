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

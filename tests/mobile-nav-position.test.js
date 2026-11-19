import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileNavGap} from '../src/mobile-nav-position.js';

test('mobile nav stays at the screen bottom after a displaced viewport',()=>{
  assert.equal(mobileNavGap({viewportHeight:844,navBottom:844}),0);
  assert.equal(mobileNavGap({viewportHeight:844,navBottom:560}),284);
  assert.equal(mobileNavGap({viewportHeight:844,navBottom:844,appliedGap:284}),284);
  assert.equal(mobileNavGap({viewportHeight:844,navBottom:1128,appliedGap:284}),0);
  assert.equal(mobileNavGap({viewportHeight:844,navBottom:560,focusedEditor:true}),0);
  assert.equal(mobileNavGap({viewportHeight:844,navBottom:0}),0);
});

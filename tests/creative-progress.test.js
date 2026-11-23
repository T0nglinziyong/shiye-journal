import test from 'node:test';
import assert from 'node:assert/strict';
import {creativeTokenText,creativeElapsed} from '../src/creative-progress.js';
test('token categories are disjoint and do not invent usage before it arrives',()=>{
 assert.equal(creativeTokenText({inputTokens:1000,reusedTokens:800,outputTokens:50}),'token输入200，复用800，输出50');
 assert.equal(creativeTokenText({}), '');
 assert.equal(creativeElapsed(125999),'2分5秒');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {creativeUsageSummary} from '../creative-agent/runtime/usage.mjs';

test('creation usage includes main turns, compaction and independent drafts',()=>{
  assert.deepEqual(creativeUsageSummary({turns:3,usage:[{prompt_tokens:100,completion_tokens:20},{prompt_tokens:150,completion_tokens:25}],compactions:[{usage:{prompt_tokens:50,completion_tokens:10}}],auxiliaryUsage:[{prompt_tokens:80,completion_tokens:15}]}),
    {turns:3,inputTokens:380,outputTokens:70});
  assert.deepEqual(creativeUsageSummary({turns:0}),{turns:0,inputTokens:0,outputTokens:0});
});

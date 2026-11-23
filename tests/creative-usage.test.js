import test from 'node:test';
import assert from 'node:assert/strict';
import {creativeUsageSummary} from '../creative-agent/runtime/usage.mjs';

test('creation usage includes main turns, compaction and independent drafts',()=>{
  assert.deepEqual(creativeUsageSummary({turns:3,usage:[{prompt_tokens:100,completion_tokens:20},{prompt_tokens:150,completion_tokens:25}],compactions:[{usage:{prompt_tokens:50,completion_tokens:10}}],auxiliaryUsage:[{prompt_tokens:80,completion_tokens:15}]}),
    {turns:3,inputTokens:380,reusedTokens:0,outputTokens:70});
  assert.deepEqual(creativeUsageSummary({turns:0}),{turns:0,inputTokens:0,reusedTokens:0,outputTokens:0});
});

test('cached input includes compaction and auxiliary calls without double counting',()=>{
 const result=creativeUsageSummary({usage:[{prompt_tokens:100,prompt_cache_hit_tokens:80,completion_tokens:10}],compactions:[{usage:{prompt_tokens:40,prompt_tokens_details:{cached_tokens:20}}}],auxiliaryUsage:[{prompt_tokens:30,prompt_cache_hit_tokens:10}]});
 assert.equal(result.inputTokens,170);assert.equal(result.reusedTokens,110);
});

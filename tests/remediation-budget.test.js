import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAISettings} from '../src/ai-settings.js';

test('A-10 configured AI turn budget is not silently capped at five',()=>{
  assert.equal(normalizeAISettings({maxTurns:12}).maxTurns,12);
  assert.equal(normalizeAISettings({maxTurns:20}).maxTurns,20);
  assert.equal(normalizeAISettings({maxTurns:100}).maxTurns,30);
  assert.equal(normalizeAISettings({}).maxTurns,12);
});

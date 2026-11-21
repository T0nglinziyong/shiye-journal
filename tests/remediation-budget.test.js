import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAISettings} from '../src/ai-settings.js';

test('AI request budget is internal, not a saved conversation setting',()=>{
  assert.equal('maxTurns' in normalizeAISettings({maxTurns:12}),false);
  assert.equal('maxTurns' in normalizeAISettings({}),false);
});

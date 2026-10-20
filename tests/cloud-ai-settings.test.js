import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudAISettingsRecord,cloudAISettingsFromMeta,CLOUD_AI_SETTINGS_ID} from '../src/cloud-ai-settings.js';
import {cloudPreferencesRecord,CLOUD_PREFERENCES_ID} from '../src/cloud-preferences.js';

test('account-scoped AI metadata preserves provider keys and all model preferences',()=>{
  const settings={provider:'custom',endpoint:'https://example.test/v1',model:'my-model',
    creationMode:'json',keys:{custom:'sk-private-abc',openai:'sk-openai-secret'},
    key:'sk-private-abc',customLayoutPrompt:'多留白',includeThumbnails:false,
    sendPresetReferences:false,maxTurns:9,temperature:1.3};
  const item=cloudAISettingsRecord(settings,'2026-10-11T12:00:00Z');
  assert.equal(item.id,CLOUD_AI_SETTINGS_ID);
  assert.equal(item.updatedAt,'2026-10-11T12:00:00Z');
  const restored=cloudAISettingsFromMeta([cloudPreferencesRecord({display:'list'}),item]);
  assert.equal(restored.key,'sk-private-abc');
  assert.equal(restored.keys.openai,'sk-openai-secret');
  assert.equal(restored.customLayoutPrompt,'多留白');
  assert.equal(restored.creationMode,'tools');
  assert.equal('creationMode' in item.settings,false);
  assert.equal(restored.includeThumbnails,false);
  assert.equal('sendPresetReferences' in restored,false);
  assert.equal('maxTurns' in restored,false);
  assert.equal(restored.temperature,1.3);
  settings.keys.custom='mutated';
  assert.equal(item.settings.keys.custom,'sk-private-abc');
});
test('AI metadata never overwrites UI settings and invalid records are ignored',()=>{
  const ui=cloudPreferencesRecord({display:'grid',paperSize:'a4'});
  const ai=cloudAISettingsRecord({provider:'openai',keys:{openai:'sk-test'}});
  assert.notEqual(CLOUD_PREFERENCES_ID,CLOUD_AI_SETTINGS_ID);
  assert.deepEqual(ui.preferences,{display:'grid',paperSize:'a4'});
  assert.equal(cloudAISettingsFromMeta([ui]),null);
  assert.equal(cloudAISettingsFromMeta([{id:CLOUD_AI_SETTINGS_ID,settings:[]}]),null);
  assert.equal(cloudAISettingsFromMeta([ui,ai])?.keys.openai,'sk-test');
});

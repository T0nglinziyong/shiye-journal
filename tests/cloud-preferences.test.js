import test from 'node:test';
import assert from 'node:assert/strict';
import {CLOUD_PREFERENCES_ID,cloudPreferencesRecord,cloudPreferencesFromMeta} from '../src/cloud-preferences.js';

test('saved UI preferences are account-scoped meta, not a model-key backup',()=>{
  const input={maxPageItems:40,display:'list',seriesCoverLayout:'pile',recognitionPixels:900,apiKey:'NEVER_SEND',privateToken:'ALSO_SECRET'};
  const row=cloudPreferencesRecord(input,'2026-10-09T12:00:00Z');
  assert.equal(row.id,CLOUD_PREFERENCES_ID);
  assert.equal(row.updatedAt,'2026-10-09T12:00:00Z');
  assert.deepEqual(row.preferences,{maxPageItems:40,display:'list',seriesCoverLayout:'pile',recognitionPixels:900});
  input.maxPageItems=80;
  assert.equal(row.preferences.maxPageItems,40,'staged preferences are immutable copy');
  assert.ok(!JSON.stringify(row).includes('apiKey'));
  assert.ok(!JSON.stringify(row).includes('NEVER_SEND'));
  assert.ok(!JSON.stringify(row).includes('ALSO_SECRET'));
});
test('new cloud metadata restores UI prefs without touching unrelated template metadata',()=>{
  assert.equal(cloudPreferencesFromMeta([{id:'journal-template-custom',template:{}}]),null);
  const chosen={maxPageItems:20,backdrop:'natural'};
  assert.deepEqual(cloudPreferencesFromMeta([{id:'irrelevant'},{id:CLOUD_PREFERENCES_ID,preferences:chosen}]),chosen);
  assert.equal(cloudPreferencesFromMeta([{id:CLOUD_PREFERENCES_ID,preferences:[]}]),null);
});

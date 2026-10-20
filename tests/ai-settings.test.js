import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_DEFAULTS,normalizeAISettings,saveAISettings,loadAISettings,supportsVision} from '../src/ai-settings.js';
import {normalizePreferences,savePreferences,loadPreferences} from '../src/preferences.js';

const memoryStorage=()=>{const entries=new Map();return {getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value)};};

test('creative delivery settings survive save and reload without changing provider parameters',()=>{
  const storage=memoryStorage();
  const settings={deliveryMode:'image',provider:'custom',key:'test-value',endpoint:'https://example.invalid/chat/completions',model:'example-model',temperature:1.25,maxTokens:10000,maxTurns:4,includeThumbnails:false,transport:'json',textMode:'none',reasoningMode:'providerDefault',requestTimeout:120,sendOutputLimit:false,disableThinking:false,includeStructureReference:false,sendPresetReferences:true,autoIncludeRecommendations:true,requireAllCandidates:false,customLayoutPrompt:'保留大块留白'};
  const saved=saveAISettings(settings,storage),restored=loadAISettings(storage);
  assert.deepEqual(restored,saved);
  for(const [key,value] of Object.entries(settings))if(!['includeThumbnails','maxTurns','deliveryMode'].includes(key))assert.deepEqual(restored[key],value,key);
  assert.equal(restored.includeThumbnails,false,'unverified custom models do not receive image input');
  assert.equal('maxTurns' in restored,false);
  assert.equal(restored.generationMode,'agent');
});

test('invalid current settings normalize to bounded defaults',()=>{
  const defaults=normalizeAISettings({transport:'unknown',textMode:'unknown',sendPresetReferences:'true',maxTurns:16,reasoningMode:'concise'});
  assert.equal(defaults.provider,'openai');
  assert.equal(defaults.deliveryMode,'tools');
  assert.equal(defaults.transport,'auto');
  assert.equal(defaults.textMode,'automatic');
  assert.equal(defaults.reasoningMode,'automatic');
  assert.equal(defaults.sendPresetReferences,true);
  assert.equal('maxTurns' in defaults,false);
  assert.equal(normalizeAISettings({reasoningMode:'providerDefault'}).reasoningMode,'providerDefault');
  assert.equal(normalizeAISettings({reasoningMode:'toString'}).reasoningMode,'automatic');
  assert.equal(normalizeAISettings(null).provider,'openai');
  assert.equal(normalizeAISettings({textMode:'minimal'}).textMode,'minimal');
  assert.equal(normalizeAISettings({textMode:'rich'}).textMode,'rich');
  assert.equal(AI_DEFAULTS.sendPresetReferences,true);
  assert.equal(normalizeAISettings({sendPresetReferences:false}).sendPresetReferences,false);
  assert.equal(AI_DEFAULTS.autoIncludeRecommendations,false);
  assert.equal(AI_DEFAULTS.requireAllCandidates,true);
  assert.equal(normalizeAISettings({requireAllCandidates:false}).requireAllCandidates,false);
  assert.equal('referencePage' in defaults,false);
  assert.equal('imageCount' in normalizeAISettings({imageCount:1}),false);
});

test('automatic organization uses current defaults and persists an explicit off choice',()=>{
  assert.equal(normalizePreferences({paperSize:'a5'}).autoOrganize,true);
  assert.equal(normalizePreferences({autoOrganize:'false'}).autoOrganize,true);
  const previous=globalThis.localStorage;
  try{
    globalThis.localStorage=memoryStorage();
    const saved=savePreferences({paperSize:'a5',orientation:'landscape',balanceLight:false,wholePaper:false,autoOrganize:false});
    assert.deepEqual(loadPreferences(),saved);
    assert.equal(loadPreferences().autoOrganize,false);
    assert.equal(loadPreferences().paperSize,'a5');
  }finally{
    if(previous===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=previous;
  }
});

test('A-12: image input is scoped to verified endpoint/model combinations',()=>{
 assert.equal(supportsVision(normalizeAISettings({provider:'deepseek',model:'deepseek-flash'})),true);
 assert.equal(supportsVision(normalizeAISettings({provider:'deepseek',endpoint:'https://example.test/chat/completions',model:'deepseek-flash'})),false);
 assert.equal(supportsVision(normalizeAISettings({provider:'deepseek',endpoint:'https://example.test/chat/completions',model:'deepseek-flash',customVision:true})),false);
 assert.equal(supportsVision(normalizeAISettings({provider:'siliconflow',model:'Qwen/Qwen2.5-VL-72B-Instruct'})),true);
 assert.equal(supportsVision(normalizeAISettings({provider:'glm',model:'glm-5v-turbo'})),true);
 assert.equal(supportsVision(normalizeAISettings({provider:'glm',model:'glm-4.6v'})),true);
 assert.equal(supportsVision(normalizeAISettings({provider:'glm',model:'glm-5.2'})),false);
 assert.equal(normalizeAISettings({provider:'glm',model:'glm-4.6v',includeThumbnails:false}).includeThumbnails,true);
 assert.equal(normalizeAISettings({provider:'glm',model:'glm-5.2',includeThumbnails:true}).includeThumbnails,false);
 assert.equal(normalizeAISettings({provider:'custom',endpoint:'https://example.test/chat/completions',model:'unknown',includeThumbnails:true}).includeThumbnails,false);
});

test('settings always use editable creation and cannot revive retired method preferences',()=>{
  for(const mode of ['tools','json','image','zip','pdf']){
    const actual=normalizeAISettings({creationMode:mode,deliveryMode:mode,generationMode:'direct'});
    assert.equal(actual.creationMode,'tools');
    assert.equal(actual.deliveryMode,'tools');
    assert.equal(actual.generationMode,'agent');
    assert.equal(actual.snapshot,false);
  }
  const storage=memoryStorage();saveAISettings({creationMode:'json'},storage);
  const persisted=JSON.parse(storage.getItem('shiye-ai-settings-v2'));
  for(const key of ['creationMode','deliveryMode','generationMode','snapshot'])assert.equal(key in persisted,false);
  assert.equal(loadAISettings(storage).generationMode,'agent');
});

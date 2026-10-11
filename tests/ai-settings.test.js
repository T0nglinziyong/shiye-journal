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
  for(const [key,value] of Object.entries(settings))assert.deepEqual(restored[key],value,key);
  assert.equal(restored.generationMode,'direct');
});

test('invalid current settings normalize to bounded defaults',()=>{
  const defaults=normalizeAISettings({transport:'unknown',textMode:'unknown',sendPresetReferences:'true',maxTurns:16,reasoningMode:'concise'});
  assert.equal(defaults.provider,'openai');
  assert.equal(defaults.deliveryMode,'tools');
  assert.equal(defaults.transport,'auto');
  assert.equal(defaults.textMode,'automatic');
  assert.equal(defaults.reasoningMode,'automatic');
  assert.equal(defaults.sendPresetReferences,true);
  assert.equal(defaults.maxTurns,16);
  assert.equal(normalizeAISettings({maxTurns:0}).maxTurns,5);
  assert.equal(normalizeAISettings({maxTurns:-1}).maxTurns,1);
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

test('A-12: image input is scoped to the verified endpoint/model or an explicit user override',()=>{
 assert.equal(supportsVision(normalizeAISettings({provider:'deepseek',model:'deepseek-flash'})),true);
 assert.equal(supportsVision(normalizeAISettings({provider:'deepseek',endpoint:'https://example.test/chat/completions',model:'deepseek-flash'})),false);
 assert.equal(supportsVision(normalizeAISettings({provider:'deepseek',endpoint:'https://example.test/chat/completions',model:'deepseek-flash',customVision:true})),true);
 assert.equal(supportsVision(normalizeAISettings({provider:'siliconflow',model:'Qwen/Qwen2.5-VL-72B-Instruct'})),true);
});

test('three creation methods are independent from web file-versus-text return form',()=>{
  for(const [mode,generation,snapshot] of [['tools','agent',false],['json','direct',false],['image','direct','image/png']]){
    const actual=normalizeAISettings({creationMode:mode,deliveryMode:'tools'});
    assert.equal(actual.creationMode,mode);
    assert.equal(actual.deliveryMode,mode);
    assert.equal(actual.generationMode,generation);
    assert.equal(actual.snapshot,snapshot);
  }
  // Old format-only choices cannot appear as a fourth/fifth method.
  assert.equal(normalizeAISettings({deliveryMode:'zip'}).creationMode,'json');
  assert.equal(normalizeAISettings({deliveryMode:'pdf'}).creationMode,'json');
});

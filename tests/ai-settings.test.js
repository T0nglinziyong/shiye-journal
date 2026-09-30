import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_DEFAULTS,normalizeAISettings,saveAISettings,loadAISettings} from '../src/ai-settings.js';
import {normalizePreferences,savePreferences,loadPreferences} from '../src/preferences.js';

const memoryStorage=()=>{const entries=new Map();return {getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value)};};

test('creative delivery settings survive save and reload without changing provider parameters',()=>{
  const storage=memoryStorage();
  const settings={deliveryMode:'image',provider:'custom',key:'test-value',endpoint:'https://example.invalid/chat/completions',model:'example-model',temperature:1.25,maxTokens:10000,maxTurns:4,includeThumbnails:false,transport:'json',textMode:'none',reasoningMode:'providerDefault',requestTimeout:120,sendOutputLimit:false,disableThinking:false,includeStructureReference:false,sendPresetReferences:true,autoIncludeRecommendations:true,requireAllCandidates:false,customLayoutPrompt:'保留大块留白'};
  const saved=saveAISettings(settings,storage),restored=loadAISettings(storage);
  assert.deepEqual(restored,saved);
  for(const [key,value] of Object.entries(settings))assert.deepEqual(restored[key],value,key);
  assert.equal(restored.generationMode,'direct');
  assert.equal(normalizeAISettings({generationMode:'direct',directPageOutput:'flattened'}).deliveryMode,'image');
});

test('old and invalid creative settings migrate to bounded safe defaults',()=>{
  const defaults=normalizeAISettings({generationMode:'unknown',directPageOutput:'unknown',transport:'unknown',textMode:'unknown',sendReference:true,sendPresetReferences:'true',referencePage:99,maxTurns:16,reasoningMode:'concise'});
  assert.equal(defaults.generationMode,'agent');
  assert.equal(defaults.directPageOutput,'editable');
  assert.equal(defaults.transport,'auto');
  assert.equal(defaults.textMode,'automatic');
  assert.equal(defaults.reasoningMode,'low');
  assert.equal(defaults.sendPresetReferences,false);
  assert.equal('referencePage' in defaults,false);
  assert.equal(defaults.maxTurns,5);
  assert.equal(normalizeAISettings({maxTurns:0}).maxTurns,5);
  assert.equal(normalizeAISettings({maxTurns:-1}).maxTurns,1);
  assert.equal(normalizeAISettings({reasoningMode:'thorough'}).reasoningMode,'providerDefault');
  assert.equal(normalizeAISettings({reasoningMode:'toString'}).reasoningMode,'automatic');
  assert.equal(normalizeAISettings(null).generationMode,'agent');
  assert.equal(normalizeAISettings({textMode:'minimal'}).textMode,'minimal');
  assert.equal(normalizeAISettings({textMode:'rich'}).textMode,'rich');
  assert.equal(AI_DEFAULTS.sendPresetReferences,false);
  assert.equal(AI_DEFAULTS.autoIncludeRecommendations,false);
  assert.equal(AI_DEFAULTS.requireAllCandidates,true);
  assert.equal(normalizeAISettings({}).requireAllCandidates,true);
  assert.equal(normalizeAISettings({requireAllCandidates:false}).requireAllCandidates,false);
  assert.equal(AI_DEFAULTS.includeStructureReference,true);
  assert.equal('imageCount' in normalizeAISettings({imageCount:1}),false);
});

test('automatic organization defaults on for old preferences and persists an explicit off choice',()=>{
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

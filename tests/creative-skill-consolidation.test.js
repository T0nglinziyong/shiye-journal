import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCreationSkills} from '../creative-agent/runtime/skills.mjs';
import {nextSkillCue} from '../creative-agent/runtime/phases.mjs';
import {techniqueCatalog,compileTechnique,describeTechnique} from '../creative-agent/library/techniques.js';
import {initialHarnessState} from '../creative-agent/runtime/agent.mjs';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {draft} from '../src/domain.js';

test('eight skills expose 30 callable methods and teach 24 variants without old IDs',async()=>{
  const skills=await loadCreationSkills(undefined,{illustrationRoot:null});
  const catalog=skills.catalog();
  assert.equal(catalog.length,8);
  const names=new Set(catalog.map(item=>item.name));
  assert.ok(techniqueCatalog.methods.every(method=>names.has(method.skill)));
  assert.equal(techniqueCatalog.methods.length,30);
  assert.equal(techniqueCatalog.methods.reduce((sum,method)=>sum+(method.variants?.length||0),0),24);
  assert.equal(catalog.reduce((count,skill)=>count+skill.methodCount,0),30);
  assert.ok(!skills.read('journal-graphics').methodCatalog.some(method=>method.id==='graphic-star'));
  assert.ok(!skills.read('journal-lettering').methodCatalog.some(method=>method.id==='title-shadow'));
  assert.throws(()=>skills.read('journal-lettering',{level:'detail',methodId:'title-shadow'}));
  assert.ok(skills.read('journal-writing').methodCatalog.some(method=>method.id==='record-checklist'));
  assert.ok(skills.read('journal-writing').guidance.includes('timeline'));
  assert.ok(skills.read('journal-writing',{level:'detail',methodId:'record-checklist'}).methods[0].variants.some(variant=>variant.key==='timeline'));
  assert.deepEqual(skills.read('journal-writing',{level:'detail',methodId:'record-checklist',variant:'timeline'}).methods[0].tool.arguments.parameters.variant,'timeline');
  assert.throws(()=>skills.read('journal-writing',{level:'detail',methodId:'record-timeline'}));
  assert.equal(skills.read('journal-composition').methodCatalog.length,0);
  assert.throws(()=>skills.read('journal-composition',{level:'detail',methodId:'composition-s'}));
  assert.ok(skills.read('paper-layering').guidance.includes('reuse-core'));
  assert.ok(skills.read('paper-layering',{level:'detail',methodId:'paper-window'}).methods[0].variants.some(variant=>variant.key==='reuse-core'));
});

test('scene-aware skill cue moves from direction through layout, lettering and detail',()=>{
  const loaded=name=>({name});
  assert.match(nextSkillCue({turns:1}),/journal-color/);
  assert.match(nextSkillCue({plan:{intent:'日常'},loadedSkills:[loaded('journal-color')]}),/journal-composition/);
  assert.match(nextSkillCue({plan:{intent:'日常'},loadedSkills:[loaded('journal-composition')],materialCount:4,visibleMaterials:2}),/paper-layering/);
  assert.match(nextSkillCue({plan:{intent:'日常'},loadedSkills:[loaded('journal-composition'),loaded('paper-layering')],materialCount:4,visibleMaterials:2}),/journal-lettering/);
  assert.match(nextSkillCue({plan:{intent:'日常'},loadedSkills:[loaded('journal-composition')],materialCount:0,visibleMaterials:0}),/journal-lettering/);
  assert.match(nextSkillCue({plan:{intent:'日常'},loadedSkills:[loaded('journal-composition'),loaded('paper-layering'),loaded('journal-lettering')],visibleMaterials:3,visibleText:2}),/journal-writing/);
  assert.match(nextSkillCue({plan:{intent:'日常'},loadedSkills:[loaded('journal-composition'),loaded('paper-layering'),loaded('journal-lettering'),loaded('journal-writing')],visibleMaterials:3,visibleText:4}),/journal-accents/);
  assert.match(nextSkillCue({plan:{intent:'叠纸长文'},loadedSkills:[loaded('journal-composition')],materialCount:10,visibleMaterials:10,visibleText:8}),/paper-layering.*overview/);
  assert.match(nextSkillCue({plan:{intent:'叠纸长文'},loadedSkills:[loaded('journal-composition'),loaded('paper-layering'),loaded('journal-lettering')],materialCount:10,visibleMaterials:10,visibleText:8}),/journal-writing/);
  assert.equal(nextSkillCue({turns:19}), '');
});

test('all documented variants compile and apply from their own example',async()=>{
  for(const method of techniqueCatalog.methods)for(const option of method.variants||[]){
    const detail=describeTechnique(method.id,{variant:option.key});
    const materials=detail.example.materials;
    const document=await createCreationDocument({draft:draft({ratio:'a5'}),assets:materials,aliases:Object.fromEntries(materials.map(asset=>[asset.alias,asset.id]))});
    const compiled=compileTechnique({methodId:method.id,parameters:detail.tool.arguments.parameters,materials});
    const result=applyCreationTransaction(document,{protocolVersion:2,transactionId:`variant-${method.id}-${option.key}`,baseSceneRevision:creationSceneRevision(document),operations:[...detail.example.prepare,...compiled.operations]},materials);
    assert.equal(result.changed,true,`${method.id}:${option.key}`);
  }
});

test('initial agent prompt stays compact and explains when to read Skills',async()=>{
  const skills=await loadCreationSkills(undefined,{illustrationRoot:null});
  const document=await createCreationDocument({draft:draft(),assets:[]});
  const state=initialHarnessState({document,skills,brief:{style:'清新'}});
  const prompt=state.messages[0].content;
  assert.ok(prompt.includes('第一次形成构图前读 journal-composition'));
  assert.ok(prompt.includes('creation_title'));
  assert.ok(prompt.includes('可选增强'));
  assert.ok(prompt.includes('复杂拆字或笔画技巧再读 journal-lettering'));
  assert.ok(prompt.length<12000);
});

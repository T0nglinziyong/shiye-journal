import test from 'node:test';
import assert from 'node:assert/strict';
import {templateCatalog,rankTemplates,templateMarginalScores} from '../creative-agent/library/matcher.js';
import {templateDetails,compileLibraryRecipe} from '../creative-agent/runtime/library.mjs';
import {exampleMaterials} from '../creative-agent/library/examples.js';
import {templateFixture,isMaterialSlot} from '../creative-agent/library/template-elements.js';
import {compileTemplate} from '../creative-agent/library/compiler.js';
test('deferred templates cannot reappear in matching or material marginal recommendations',()=>{
 const template=templateCatalog.templates.find(t=>t.id==='ac-26');assert.equal(template.usage.status,'deferred');
 assert.deepEqual(rankTemplates({materials:exampleMaterials,templates:[template]}),[]);
 const scores=templateMarginalScores({selected:exampleMaterials.slice(0,1),candidates:exampleMaterials.slice(1,2),templates:[template]});
 assert.equal(scores.get('m2').utility,0);assert.equal(scores.get('m2').templateId,undefined);
 assert.ok(rankTemplates({materials:exampleMaterials}).length>0);
});
test('an explicit deferred template ID returns its reason without a callable recipe and rejects execution',()=>{
 const detail=templateDetails('ac-26');assert.equal(detail.available,false);assert.match(detail.reason,/曲面变形/);assert.equal(detail.tool,undefined);
 assert.throws(()=>compileLibraryRecipe({}, {kind:'template',recipeId:'ac-26',parameters:{id:'attempt'}}),/暂未启用/);
 assert.equal(templateDetails('center-1').available,true);assert.equal(templateDetails('center-1').tool.name,'creation_recipe');
});

test('template details describe every position and distinguish materials from digital fallbacks',()=>{
 const detail=templateDetails('center-1');
 assert.equal(detail.slots.length,detail.elements.length);
 assert.ok(detail.slots.some(s=>s.input==='material-or-group'&&s.whenUnassigned==='blank'));
 assert.ok(detail.slots.some(s=>s.whenUnassigned==='writing-guide'));
 assert.ok(detail.slots.some(s=>s.whenUnassigned==='keep-digital-graphic'));
 assert.match(detail.parameters.bindings,/\[\].*不放任何素材/);
});

test('Harness passes explicit empty and specific material bindings through to real Scene transactions',async()=>{
 const {draft}=await import('../src/domain.js'),{createCreationDocument}=await import('../src/creation-document.js'),{applyCreationTransaction,creationSceneRevision}=await import('../src/creation-transaction.js');
 const doc=await createCreationDocument({draft:draft({ratio:'a5'}),assets:exampleMaterials,aliases:Object.fromEntries(exampleMaterials.map(a=>[a.alias,a.id]))});
 for(const bindings of [[],[{slotId:'e2',alias:'m1'}]]){
  const compiled=compileLibraryRecipe(doc,{kind:'template',recipeId:'center-1',parameters:{id:'bound',bindings,texts:{e7:'今天'}}});
  assert.deepEqual(compiled.report.used,bindings.map(b=>b.alias));
  assert.equal(applyCreationTransaction(doc,{protocolVersion:2,transactionId:'slot-binding',baseSceneRevision:creationSceneRevision(doc),operations:compiled.operations},exampleMaterials).changed,true);
 }
});

test('structure-only sketches cannot be recommended or executed as finished template recipes',()=>{
 const sketches=templateCatalog.templates.filter(t=>!t.reconstruction);
 assert.ok(sketches.length>0);
 for(const t of sketches){
  assert.equal(templateDetails(t.id).available,false,t.id);
  assert.throws(()=>compileLibraryRecipe({}, {kind:'template',recipeId:t.id,parameters:{id:'sketch'}}),/暂未启用/);
 }
 assert.deepEqual(rankTemplates({materials:exampleMaterials,templates:sketches}),[]);
});

test('every available template leaves every unbound material slot empty and reports its fallback',()=>{
 for(const template of templateCatalog.templates.filter(t=>t.reconstruction)){
  const detail=templateDetails(template.id),fixture=templateFixture(template);
  assert.equal(detail.available,true,template.id);
  assert.deepEqual(detail.slots.map(s=>s.id),template.elements.map(s=>s.id),template.id);
  if(template.elements.every(isMaterialSlot)){
   assert.ok(detail.slots.every(s=>s.whenUnassigned==='blank'),template.id);
   assert.throws(()=>compileTemplate({...fixture,templateId:template.id,id:'empty-'+template.id,bindings:[],title:'今天',texts:{}}),/没有可放置的素材或文字/,template.id);
   continue;
  }
  const compiled=compileTemplate({...fixture,templateId:template.id,id:'empty-'+template.id,bindings:[],title:'今天',texts:{}});
  assert.deepEqual(compiled.report.used,[],template.id);
  assert.equal(compiled.operations.some(op=>op.op==='material.add'||op.children?.some(child=>child.op==='material.add')),false,template.id);
  for(const slot of template.elements.filter(isMaterialSlot)){
   assert.equal(detail.slots.find(s=>s.id===slot.id).whenUnassigned,'blank',template.id+':'+slot.id);
   assert.deepEqual(compiled.report.slots.find(s=>s.slotId===slot.id),{slotId:slot.id,status:'blank',reason:'unassigned'},template.id+':'+slot.id);
  }
 }
});

test('a real card does not acquire tutorial writing lines without supplied copy',()=>{
 const template=templateCatalog.templates.find(t=>t.id==='ac-19');
 const fixture=templateFixture(template);
 const compiled=compileTemplate({...fixture,templateId:template.id,id:'ac19-card',bindings:[{slotId:'lower-right-card',alias:fixture.bindings.find(b=>b.slotId==='lower-right-card').alias}],texts:{},title:'今日小记'});
 assert.deepEqual(compiled.report.slots.find(s=>s.slotId==='lower-right-writing'),{slotId:'lower-right-writing',status:'blank',reason:'unassigned'});
 assert.equal(templateDetails(template.id).slots.find(s=>s.id==='lower-right-writing').whenUnassigned,'blank');
});

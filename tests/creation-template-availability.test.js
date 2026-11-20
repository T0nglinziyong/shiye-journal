import test from 'node:test';
import assert from 'node:assert/strict';
import {templateCatalog,rankTemplates,templateMarginalScores} from '../src/creation-library/matcher.js';
import {templateDetails,compileLibraryRecipe} from '../compute-server/harness/library.mjs';
import {exampleMaterials} from '../src/creation-library/examples.js';
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
 assert.equal(sketches.length,13);
 for(const t of sketches){
  assert.equal(templateDetails(t.id).available,false,t.id);
  assert.throws(()=>compileLibraryRecipe({}, {kind:'template',recipeId:t.id,parameters:{id:'sketch'}}),/暂未启用/);
 }
 assert.deepEqual(rankTemplates({materials:exampleMaterials,templates:sketches}),[]);
});

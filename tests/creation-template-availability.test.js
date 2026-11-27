import test from 'node:test';
import assert from 'node:assert/strict';
import {templateCatalog,rankTemplates,templateMarginalScores} from '../creative-agent/library/matcher.js';
import {templateDetails,compileLibraryRecipe} from '../creative-agent/runtime/library.mjs';
import {listCurrentTemplates} from '../creative-agent/library/current-templates.js';
import {exampleMaterials} from '../creative-agent/library/examples.js';

test('legacy matching helper still rejects deferred sketches',()=>{
 const template=templateCatalog.templates.find(t=>t.id==='ac-26');
 assert.equal(template.usage.status,'deferred');
 assert.deepEqual(rankTemplates({materials:exampleMaterials,templates:[template]}),[]);
 const scores=templateMarginalScores({selected:exampleMaterials.slice(0,1),
  candidates:exampleMaterials.slice(1,2),templates:[template]});
 assert.equal(scores.get('m2').utility,0);
});

test('every old template remains readable but cannot enter active recipes',()=>{
 for(const template of templateCatalog.templates){
  const detail=templateDetails(template.id);
  assert.equal(detail.available,false,template.id);
  assert.match(detail.reason,/旧模板已下线/);
  assert.throws(()=>compileLibraryRecipe({}, {kind:'template',recipeId:template.id,
   parameters:{id:'attempt'}}),/旧模板已下线/);
 }
});

test('the fourteen new templates expose per-object required and preferred replacement conditions',()=>{
 const current=listCurrentTemplates();
 assert.equal(current.length,14);
 for(const template of current){
  const detail=templateDetails(template.id);
  assert.equal(detail.available,true,template.id);
  assert.deepEqual(detail.slots.map(slot=>slot.id),template.elements.map(slot=>slot.id));
  assert.ok(detail.slots.every(slot=>slot.must?.length&&slot.prefer?.length),template.id);
 }
});

test('active template recipe compiles from the same measured source as the template library',async()=>{
 const {draft}=await import('../src/domain.js');
 const {createCreationDocument}=await import('../src/creation-document.js');
 const document=await createCreationDocument({draft:draft({mode:'spread',ratio:'custom:125x176'}),assets:[]});
 const compiled=compileLibraryRecipe(document,{kind:'template',recipeId:'XHS-海岛排版',
  parameters:{reference:'page',bindings:[],texts:{'L-upper-title':'今天'}}});
 assert.equal(compiled.templateId,'XHS-海岛排版');
 assert.ok(compiled.operations.some(operation=>operation.op==='page.update'));
 assert.ok(compiled.operations.some(operation=>operation.op==='text.add'&&operation.content==='今天'));
 assert.equal(compiled.operations.some(operation=>operation.op==='material.add'),false);
});

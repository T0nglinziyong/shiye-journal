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

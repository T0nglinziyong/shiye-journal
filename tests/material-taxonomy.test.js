import test from 'node:test';
import assert from 'node:assert/strict';
import {materialKinds,materialKindDetails,materialRoles,contentCategories,layoutFits,layoutFitGroups,tagGroups,
  MATERIAL_TAXONOMY_VERSION} from '../src/material-taxonomy.js';
import {initialMaterialClassification,userMaterialClassification,applyAIClassification,
  validateMaterialClassification} from '../src/material-classification.js';
import {migrateMaterialV1} from '../src/data-migrations/material-v1-to-v2.js';

test('four fixed category dictionaries have stable unique ids and seven open tag groups',()=>{
 assert.equal(MATERIAL_TAXONOMY_VERSION,2);
 for(const rows of [materialKinds,materialKindDetails,materialRoles,contentCategories,layoutFits,tagGroups])
  assert.equal(new Set(rows.map(([id])=>id)).size,rows.length);
 assert.equal(materialKinds.length,14);assert.equal(materialRoles.length,10);
 assert.equal(contentCategories.length,13);assert.equal(layoutFits.length,24);assert.equal(tagGroups.length,7);
 for(const rows of [materialKinds,materialRoles,contentCategories,layoutFits])
  assert.ok(rows.some(([id])=>id==='other'));
});
test('compact layout choices cover every stored fit without changing stable ids',()=>{
 assert.equal(layoutFitGroups.length,9);
 assert.deepEqual(layoutFitGroups.flatMap(([, ,members])=>members).sort(),layoutFits.map(([id])=>id).sort());
 assert.equal(new Set(layoutFitGroups.flatMap(([, ,members])=>members)).size,layoutFits.length);
 const record=initialMaterialClassification({kind:'sticker'});
 assert.deepEqual(validateMaterialClassification({...record,layoutFits:['point','overlay']}).layoutFits,['point','overlay']);
});
test('user-confirmed type survives AI content and material guesses',()=>{
 const base={...initialMaterialClassification({kind:'sticker',role:'accent'}),title:'布纹贴纸',
  categoryEvidence:{kind:{source:'user',confidence:1}},tagEvidence:{}};
 const result={modelVersion:'vision-1',kind:{id:'paper',confidence:.99},
  kindDetail:{id:'paper.textured',confidence:.97},role:{id:'accent',confidence:.92},
  contentTags:[{value:'布纹',confidence:.95}],materialTags:[{value:'布料',confidence:.45}],
  tags:[{value:'我自己的标签',confidence:.9}]};
 const output=applyAIClassification(base,result);
 assert.equal(output.kind,'sticker');assert.equal(output.kindDetail,null);
 assert.deepEqual(output.contentTags,['布纹']);assert.deepEqual(output.materialTags,[]);
 assert.deepEqual(output.tags,['我自己的标签']);
 const confirmed=userMaterialClassification(output,{materialTags:['贴纸纸'],tags:['自定义']});
 assert.deepEqual(applyAIClassification(confirmed,result).materialTags,['贴纸纸']);
 assert.deepEqual(applyAIClassification(confirmed,result).tags,['自定义']);
 validateMaterialClassification(confirmed);
});
test('AI description is factual metadata and a user edit cannot be overwritten',()=>{
 const base={...initialMaterialClassification({kind:'photo'}),title:'室内照片'};
 const suggestion={modelVersion:'deepseek-flash',kind:{id:'photo',confidence:.9},
  role:{id:'support',confidence:.9},description:'浅色室内画面，中间有垂挂的格纹布。',descriptionConfidence:.8};
 const analyzed=applyAIClassification(base,suggestion);
 assert.equal(analyzed.description,suggestion.description);
 assert.equal(analyzed.descriptionEvidence.source,'ai');
 const edited={...analyzed,description:'窗边的格纹窗帘。',descriptionEvidence:{source:'user',confidence:1}};
 assert.equal(applyAIClassification(edited,{...suggestion,description:'另一段描述'}).description,
  edited.description);
 assert.equal(applyAIClassification(base,{...suggestion,descriptionConfidence:.4}).description,undefined);
});
test('AI descriptions directly describe the material without scene prefaces or transitions',()=>{
 const base={...initialMaterialClassification({kind:'sticker'}),title:'花朵贴纸'};
 const suggestion={modelVersion:'deepseek-flash',kind:{id:'sticker',confidence:.9},
  role:{id:'accent',confidence:.9},description:'画面中可以看到浅粉色花朵位于画面中央。此外，花瓣边缘有白色描线。',
  descriptionConfidence:.9};
 const analyzed=applyAIClassification(base,suggestion);
 assert.equal(analyzed.description,'浅粉色花朵居中。花瓣边缘有白色描线。');
 assert.equal(applyAIClassification({...base,description:'用户写的画面中有花朵',
  descriptionEvidence:{source:'user',confidence:1}},suggestion).description,'用户写的画面中有花朵');
});
test('a partial reclassification does not erase existing optional categories or AI tags',()=>{
 const base=initialMaterialClassification({kind:'sticker'});
 const first=applyAIClassification(base,{modelVersion:'first',kind:{id:'sticker',confidence:.9},
  role:{id:'accent',confidence:.9},contentCategories:[{id:'animals',confidence:.9}],
  contentTags:[{value:'猫',confidence:.9}],themeTags:[{value:'日常',confidence:.9}]});
 const second=applyAIClassification(first,{modelVersion:'second',kind:{id:'sticker',confidence:.9},
  role:{id:'accent',confidence:.9},colorTags:[{value:'蓝色',confidence:.9}]});
 assert.deepEqual(second.contentCategories,['animals']);
 assert.deepEqual(second.contentTags,['猫']);
 assert.deepEqual(second.themeTags,['日常']);
 assert.deepEqual(second.colorTags,['蓝色']);
});
test('legacy migration preserves custom tags and does not invent a subtype',()=>{
 const converted=migrateMaterialV1({id:'a',title:'小纸片',kind:'sticker',role:'annotation',
  texture:'贴纸纸',tags:['用户标签'],contentTags:['猫'],semanticColorNames:['蓝色'],
  placementHints:['角落放置']});
 assert.equal(converted.kind,'sticker');assert.equal(converted.kindDetail,null);
 assert.equal(converted.role,'marker');assert.deepEqual(converted.tags,['用户标签','角落放置']);
 assert.deepEqual(converted.materialTags,['贴纸纸']);assert.deepEqual(converted.colorTags,['蓝色']);
 assert.equal(Object.hasOwn(converted,'texture'),false);
});
test('unmapped legacy categories become other without losing original ids or user tags',()=>{
 const converted=migrateMaterialV1({id:'legacy',kind:'unknown-paper-craft',role:'other',
  tags:['用户自定义'],contentTags:['蝴蝶']});
 assert.equal(converted.kind,'other');assert.equal(converted.role,'other');
 assert.equal(converted.kindDetail,'other.unclassified');
 assert.deepEqual(converted.tags,['用户自定义']);
 assert.deepEqual(converted.contentTags,['蝴蝶']);
 assert.equal(converted.categoryEvidence.kind.originalId,'unknown-paper-craft');
 assert.equal(converted.categoryEvidence.role.originalId,'other');
 assert.deepEqual(converted.contentCategories,[]);
 assert.deepEqual(converted.layoutFits,[]);
});
test('explicit confirmation protects unchanged categories and all open tag groups',()=>{
 const prior={...initialMaterialClassification({kind:'sticker',role:'accent',tags:['自定义']}),
  title:'蝴蝶贴纸',kindDetail:'sticker.subject'};
 const confirmed=userMaterialClassification(prior,{}, {confirm:true});
 const ai={modelVersion:'vision-2',kind:{id:'paper',confidence:.99},
  kindDetail:{id:'paper.patterned',confidence:.99},role:{id:'background',confidence:.98},
  tags:[{value:'模型标签',confidence:.95}],contentCategories:[{id:'animals',confidence:.9}]};
 const result=applyAIClassification(confirmed,ai);
 assert.equal(result.kind,'sticker');assert.equal(result.kindDetail,'sticker.subject');
 assert.equal(result.role,'accent');assert.deepEqual(result.tags,['自定义']);
 assert.deepEqual(result.contentCategories,[]);
 assert.equal(applyAIClassification({...confirmed,reviewStatus:'ready'},ai).reviewStatus,'ready');
});
test('successful classification clears pending review unless the user explicitly kept it pending',()=>{
 const base={...initialMaterialClassification({kind:'sticker'}),reviewStatus:'pendingReview'};
 const result={modelVersion:'vision',kind:{id:'sticker',confidence:.9},
  role:{id:'accent',confidence:.9}};
 assert.equal(applyAIClassification(base,result).reviewStatus,'ready');
 assert.equal(applyAIClassification({...base,reviewStatusSource:'user'},result).reviewStatus,'pendingReview');
});
test('a user-confirmed subtype prevents AI from switching its parent type',()=>{
 const prior={...initialMaterialClassification({kind:'sticker'}),kindDetail:'sticker.subject',
  categoryEvidence:{kind:{source:'default'},kindDetail:{source:'user',confidence:1}}};
 const result=applyAIClassification(prior,{modelVersion:'vision-2',kind:{id:'paper',confidence:.99},
  kindDetail:{id:'paper.patterned',confidence:.99},role:{id:'support',confidence:.9}});
 assert.equal(result.kind,'sticker');assert.equal(result.kindDetail,'sticker.subject');
});

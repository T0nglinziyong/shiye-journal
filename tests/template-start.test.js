import assert from 'node:assert/strict';
import test from 'node:test';
import {itemFromAsset,project} from '../src/domain.js';
import {manualTemplateChoices,applyManualTemplate} from '../src/template-start.js';
import {executableJournalTemplates,journalTemplateComposition} from '../src/journal-template-composition.js';

test('manual creation ranks real templates and preserves physical material sizes',async()=>{
  const draft=project('版式',{mode:'spread',ratio:'a4'}).drafts[0];
  const materials=[
    {id:'photo',title:'旅行照片',kind:'photo',physicalWidthMM:45,physicalHeightMM:60,tags:['旅行']},
    {id:'paper',title:'文字纸片',kind:'paper',physicalWidthMM:65,physicalHeightMM:45}
  ];
  const choices=manualTemplateChoices(draft,materials,['photo','paper']);
  assert.ok(choices.length>0);
  assert.ok(choices[0].template.elements.length>0);
  assert.ok(choices[0].assignments.every(row=>materials.some(asset=>asset.id===row.alias)));
  draft.items=[itemFromAsset(materials[0],draft,120,160,1,true)];
  const result=await applyManualTemplate(draft,materials,['photo','paper'],choices[0].id);
  assert.equal(result.placed,draft.items.length);
  assert.equal(draft.startTemplateID,choices[0].id);
  assert.equal(new Set(draft.items.map(item=>item.assetID)).size,draft.items.length);
  assert.ok(draft.items.every(item=>Number.isFinite(item.x)&&Number.isFinite(item.y)));
  assert.ok(draft.primitives.length>0);
  assert.equal(draft.layers[0].type,'group');
});

test('template element view uses the exact layout passed to the creation tool',()=>{
  const catalog=executableJournalTemplates();
  assert.equal(catalog.length,78);
  const item=catalog.find(template=>template.id==='center-1');
  const layout=journalTemplateComposition(item);
  assert.equal(layout.toolTemplateId,'center-1');
  assert.strictEqual(layout.elements,item.elements);
  assert.ok(layout.elements.every(element=>element.box.length===4));
  assert.equal(journalTemplateComposition({id:'journal-template:custom',origin:'user'}),null);
});

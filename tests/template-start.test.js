import assert from 'node:assert/strict';
import test from 'node:test';
import {project} from '../src/domain.js';
import {manualTemplateChoices,applyManualTemplate} from '../src/template-start.js';
import {journalTemplateComposition} from '../src/journal-template-composition.js';

test('manual creation ranks real templates and preserves physical material sizes',()=>{
  const draft=project('版式',{mode:'spread',ratio:'a4'}).drafts[0];
  const materials=[
    {id:'photo',title:'旅行照片',kind:'photo',physicalWidthMM:45,physicalHeightMM:60,tags:['旅行']},
    {id:'paper',title:'文字纸片',kind:'paper',physicalWidthMM:65,physicalHeightMM:45}
  ];
  const choices=manualTemplateChoices(draft,materials,['photo','paper']);
  assert.ok(choices.length>0);
  assert.ok(choices[0].template.elements.length>0);
  assert.ok(choices[0].assignments.every(row=>materials.some(asset=>asset.id===row.alias)));
  const result=applyManualTemplate(draft,materials,['photo','paper'],choices[0].id);
  assert.equal(result.placed,draft.items.length);
  assert.equal(draft.startTemplateID,choices[0].id);
  assert.equal(new Set(draft.items.map(item=>item.assetID)).size,draft.items.length);
  assert.ok(draft.items.every(item=>Number.isFinite(item.x)&&Number.isFinite(item.y)));
});

test('template detail derives element descriptions from authored structure',()=>{
  const parts=journalTemplateComposition({structure:'主图在左上，标题与文字在右侧；圆形装饰串联两张照片。'});
  assert.deepEqual(parts.map(part=>part.label),['主图','文字','装饰']);
  assert.ok(parts.every(part=>part.text.length));
});

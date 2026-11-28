import assert from 'node:assert/strict';
import test from 'node:test';
import {itemFromAsset,project} from '../src/domain.js';
import {manualTemplateChoices,applyManualTemplate} from '../src/template-start.js';
import {paperColorFor} from '../src/paper-colors.js';
import {executableJournalTemplates,journalTemplateComposition} from '../src/journal-template-composition.js';
import {removeEditableScene} from '../src/scene-structure-edit.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {standbyMaterialRows} from '../src/material-standby.js';

test('manual creation ranks real templates and preserves physical material sizes',async()=>{
  const draft=project('版式',{mode:'spread',ratio:'a4'}).drafts[0];
  const requestedPage={height:draft.physicalPageHeightMM,width:draft.canvas.width,ratio:draft.pageRatio};
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
  assert.equal(draft.physicalPageHeightMM,requestedPage.height);
  assert.equal(draft.canvas.width,requestedPage.width);
  assert.equal(draft.pageRatio,requestedPage.ratio);
  assert.equal(result.placed,draft.items.length);
  assert.equal(draft.startTemplateID,choices[0].id);
  assert.equal(new Set(draft.items.map(item=>item.assetID)).size,draft.items.length);
  assert.ok(draft.items.every(item=>Number.isFinite(item.x)&&Number.isFinite(item.y)));
  for(const item of draft.items){
    const source=materials.find(asset=>asset.id===item.assetID);
    assert.ok(Math.abs(item.width/draft.canvas.height*draft.physicalPageHeightMM-source.physicalWidthMM)<.01);
    assert.ok(Math.abs(item.height/draft.canvas.height*draft.physicalPageHeightMM-source.physicalHeightMM)<.01);
  }
  assert.ok(draft.primitives.length>0);
  assert.ok(draft.layers.length>1);
  assert.ok(draft.layers.some(layer=>layer.type==='material'));
  await assert.rejects(()=>applyManualTemplate(draft,materials,['photo'],'center-1'),/旧模板已下线匹配/);
});

test('template element view uses the exact layout passed to the creation tool',()=>{
  const catalog=executableJournalTemplates();
  assert.equal(catalog.length,92);
  assert.equal(catalog.filter(template=>template.type==='new').length,14);
  assert.equal(catalog.filter(template=>template.isCallable).length,14);
  assert.ok(catalog.every(template=>!template.exampleImagePath&&!template.exampleIsReference));
  const item=catalog.find(template=>template.id==='center-1');
  const layout=journalTemplateComposition(item);
  assert.equal(layout.toolTemplateId,'center-1');
  assert.strictEqual(layout.elements,item.elements);
  assert.ok(layout.elements.every(element=>element.box.length===4));
  assert.equal(journalTemplateComposition({id:'journal-template:custom',origin:'user'}),null);
  const current=catalog.find(template=>template.id==='D143');
  const active=journalTemplateComposition(current);
  assert.equal(active.type,'new');
  assert.ok(active.elements.some(element=>element.must.length&&element.prefer.length));
});

test('manual template initial draft parks an unfit final-required material',async()=>{
 const draft=project('待放素材',{mode:'spread',ratio:'a4'}).drafts[0];
 const asset={id:'tiny',title:'小纸片',kind:'paper',physicalWidthMM:5,physicalHeightMM:5};
 const result=await applyManualTemplate(draft,[asset],['tiny'],'S01-苹果绿白',
  {requiredAssetIDs:['tiny']});
 assert.equal(result.placed,0);
 assert.equal(result.remaining,1);
 assert.ok(draft.layers.some(layer=>layer.assetID==='tiny'&&layer.isParked));
});

test('template commands use safe aliases for cloud asset IDs while retaining source identity',async()=>{
 const draft=project('云端素材',{mode:'spread',ratio:'a4'}).drafts[0];
 const asset={id:'cos/三格复古物品照片条:01',title:'照片条',kind:'photo',physicalWidthMM:37.1,physicalHeightMM:149.7};
 const choice=manualTemplateChoices(draft,[asset],[asset.id],{requiredAssetIDs:[asset.id]})[0];
 assert.ok(choice);
 const result=await applyManualTemplate(draft,[asset],[asset.id],choice.id,
  {requiredAssetIDs:[asset.id],choice});
 assert.equal(result.placed+result.remaining,1);
 assert.ok(draft.items.some(item=>item.assetID===asset.id));
});

test('deleting a placed required template source makes it available in standby',async()=>{
 const draft=project('删除后备选',{mode:'spread',ratio:'a4'}).drafts[0];
 const asset={id:'required-photo',title:'真实照片',kind:'photo',physicalWidthMM:45,physicalHeightMM:60};
 const choice=manualTemplateChoices(draft,[asset],[asset.id],{requiredAssetIDs:[asset.id]})
  .find(row=>row.plan.used.length);
 assert.ok(choice);
 await applyManualTemplate(draft,[asset],[asset.id],choice.id,{choice,requiredAssetIDs:[asset.id]});
 const placed=draft.items.find(item=>item.assetID===asset.id&&!item.isParked);
 assert.ok(placed);
 removeEditableScene(draft,placed.id,{policy:USER_SCENE_POLICY});
 assert.deepEqual(standbyMaterialRows(draft,[asset],[asset.id]).map(row=>row.asset.id),[asset.id]);
});

test('manual template keeps its generated page colors alongside the layers',async()=>{
 const single=project('单页底色',{mode:'single',ratio:'a4'}).drafts[0];
 await applyManualTemplate(single,[],[],'D153');
 assert.equal(single.paperColor,'#82DCF5');
 assert.ok(single.layers.some(layer=>layer.type==='text'));

 const spread=project('双页底色',{mode:'spread',ratio:'a4'}).drafts[0];
 await applyManualTemplate(spread,[],[],'S04-粉黑百合');
 assert.equal(paperColorFor(spread,'left'),'#EF7597');
 assert.equal(paperColorFor(spread,'right'),'#343B40');
 assert.ok(spread.layers.some(layer=>layer.type==='text'));
 await applyManualTemplate(spread,[],[],'XHS-海岛排版');
 assert.equal(paperColorFor(spread,'left'),'#F8F8EE');
 assert.equal(paperColorFor(spread,'right'),'#F8F8EE');
});

test('single page can use one leaf of a spread without importing the other leaf',async()=>{
 const draft=project('取双页的一页',{mode:'single',ratio:'a4'}).drafts[0];
 const choice=manualTemplateChoices(draft,[],[]).find(row=>row.mode==='leaf');
 assert.ok(choice);
 assert.equal(choice.template.pageMode,'single');
 assert.ok(choice.template.elements.every(element=>element.page==='single'));
 await applyManualTemplate(draft,[],[],choice.id,{choice});
 assert.equal(draft.startTemplateID,choice.id);
 assert.ok(draft.layers.length>0);
 assert.ok(draft.layers.every(layer=>layer.page!=='right'&&layer.page!=='left'));
 assert.ok(draft.layers.some(layer=>layer.type==='text'));
});

test('spread can combine two singles with independent page colors and unique layer ids',async()=>{
 const draft=project('双单页',{mode:'spread',ratio:'a4'}).drafts[0];
 const choice=manualTemplateChoices(draft,[],[]).find(row=>row.mode==='pair'&&row.left.id!==row.right.id);
 assert.ok(choice);
 await applyManualTemplate(draft,[],[],choice.id,{choice});
 assert.equal(draft.startTemplateID,choice.id);
 assert.equal(new Set(draft.layers.map(layer=>layer.id)).size,draft.layers.length);
 assert.ok(draft.layers.some(layer=>layer.id.startsWith('left-')));
 assert.ok(draft.layers.some(layer=>layer.id.startsWith('right-')));
 assert.ok(draft.layers.some(layer=>layer.type==='text'));
 assert.ok(paperColorFor(draft,'left'));
 assert.ok(paperColorFor(draft,'right'));
});

test('cross-mode templates scale layout but keep every real input at its calibrated millimeters',async()=>{
 const assets=[
  {id:'photo',title:'旅途照片',kind:'photo',physicalWidthMM:43,physicalHeightMM:58},
  {id:'paper',title:'纹样纸',kind:'paper',physicalWidthMM:61,physicalHeightMM:44}
 ];
 for(const [mode,ratio,choiceMode] of [['single','weeks','leaf'],['spread','a4','pair']]){
  const draft=project('尺寸验收',{mode,ratio}).drafts[0];
  const before={canvas:structuredClone(draft.canvas),height:draft.physicalPageHeightMM};
  const choice=manualTemplateChoices(draft,assets,assets.map(asset=>asset.id))
    .find(row=>row.mode===choiceMode&&row.plan.used.length);
  assert.ok(choice,`${choiceMode} should match at least one real source`);
  await applyManualTemplate(draft,assets,assets.map(asset=>asset.id),choice.id,{choice});
  assert.deepEqual(draft.canvas,before.canvas);
  assert.equal(draft.physicalPageHeightMM,before.height);
  const placed=draft.items.filter(item=>!item.isParked);
  assert.ok(placed.length>0);
  for(const item of draft.items){
   const source=assets.find(asset=>asset.id===item.assetID);
   assert.ok(source);
   const mmPerPixel=draft.physicalPageHeightMM/draft.canvas.height;
   assert.ok(Math.abs(item.width*mmPerPixel-source.physicalWidthMM)<.02,`${choiceMode}: width ${item.assetID}`);
   assert.ok(Math.abs(item.height*mmPerPixel-source.physicalHeightMM)<.02,`${choiceMode}: height ${item.assetID}`);
   assert.equal(item.manualVisualResize,undefined);
  }
 }
});

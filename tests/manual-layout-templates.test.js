import test from 'node:test';
import assert from 'node:assert/strict';
import {draft,validatePhysicalDraft} from '../src/domain.js';
import {manualLayoutChoices,applyManualLayout} from '../src/manual-layout-templates.js';

const assets=[
  {id:'photo',kind:'photo',title:'旅途照片',physicalWidthMM:50,physicalHeightMM:60,supply:{quantity:1}},
  {id:'paper',kind:'paper',title:'文字便签',physicalWidthMM:45,physicalHeightMM:35,supply:{quantity:1}},
  {id:'sticker',kind:'sticker',title:'花朵',physicalWidthMM:20,physicalHeightMM:20,supply:{quantity:1}}
];
test('manual layout suggestions follow selected materials, style and purpose',()=>{
  assert.equal(manualLayoutChoices({assets,basket:['photo','paper'],styles:['摄影叙事'],purposes:['影像故事']})[0].id,'story');
  assert.equal(manualLayoutChoices({assets,basket:['photo','paper'],styles:['杂志网格'],purposes:['图文收藏']})[0].id,'collection');
  assert.equal(manualLayoutChoices({assets,basket:['sticker'],styles:['极简留白'],purposes:['主题封面']})[0].id,'cover');
});
test('manual layout is editable and keeps measured sizes without overlap or fake assets',()=>{
  const page=draft({ratio:'a4'}),result=applyManualLayout(page,assets,['photo','paper','sticker'],'story');
  assert.equal(result.placed,3);assert.equal(page.items.length,3);
  assert.deepEqual(validatePhysicalDraft(page,assets),[]);
  for(const item of page.items){const source=assets.find(asset=>asset.id===item.assetID);assert.ok(source);assert.ok(Math.abs(item.width/source.physicalWidthMM*page.physicalPageHeightMM/page.canvas.height-1)<1e-8);assert.ok(item.generationBaseline);}
  assert.equal(page.paperPattern,'lines');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {matchingStageItems,matchingPageSize,applyMatchingStage} from '../src/matching-stage.js';
import {drawPaper} from '../src/paper-rendering.js';
import {createCanvas} from 'canvas';

test('both page modes use one two-sheet workspace and preserve measured size',()=>{
  const asset={id:'sticker',title:'贴纸',physicalWidthMM:42,physicalHeightMM:59};
  assert.deepEqual(matchingPageSize('a4'),{width:420,height:297});
  const stage=matchingStageItems([asset],{sticker:{x:.7,y:.4}},'a4');
  assert.equal(stage[0].width,.1);
  assert.equal(stage[0].height,59/297);
  const page=draft({mode:'spread',ratio:'a4'});
  applyMatchingStage(page,[asset],['sticker'],{sticker:{x:.7,y:.4}});
  assert.equal(page.items.length,1);
  assert.equal(page.items[0].x,page.canvas.width*.7);
  assert.equal(page.items[0].y,page.canvas.height*.4);
  assert.equal(page.items[0].isParked,false);
  assert.ok(Math.abs(page.items[0].width-page.canvas.height*42/297)<1e-10);
});

test('later additions enter the same page without overlap',()=>{
  const assets=Array.from({length:12},(_,index)=>({id:`asset-${index}`,physicalWidthMM:45,physicalHeightMM:45}));
  const items=matchingStageItems(assets,{},'a4');
  assert.ok(items.every(item=>item.x>=item.width/2&&item.x<=1-item.width/2&&item.y>=item.height/2&&item.y<=1-item.height/2));
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
    const left=items[i],right=items[j];
    assert.ok(Math.abs(left.x-right.x)>=(left.width+right.width)/2||
      Math.abs(left.y-right.y)>=(left.height+right.height)/2);
  }
  const page=draft({mode:'spread',ratio:'a4'});
  applyMatchingStage(page,assets,assets.map(asset=>asset.id),{});
  assert.equal(page.items.length,12);
  assert.ok(page.items.every(item=>!item.isParked));
});

test('a placed material may sit outside the paper while keeping a corner on it',()=>{
  const asset={id:'large',physicalWidthMM:240,physicalHeightMM:60};
  const item=matchingStageItems([asset],{large:{x:1.3,y:2.2}},'a4')[0];
  assert.equal(item.x,1+item.width/2-.01);
  assert.equal(item.y,1+item.height/2-.01);
  const page=draft({mode:'spread',ratio:'a4'});
  applyMatchingStage(page,[asset],['large'],{large:{x:1.3,y:2.2}});
  assert.equal(page.items[0].isParked,false);
  assert.ok(page.items[0].x>page.canvas.width);
  assert.ok(page.items[0].x-page.items[0].width/2<page.canvas.width);
  assert.ok(page.items[0].y-page.items[0].height/2<page.canvas.height);
  const opposite=matchingStageItems([asset],{large:{x:-1,y:-1}},'a4')[0];
  assert.equal(opposite.x,-opposite.width/2+.01);
  assert.equal(opposite.y,-opposite.height/2+.01);
});

test('single mode dims the second sheet without changing workspace dimensions',()=>{
  const page=draft({mode:'spread',ratio:'a4'});
  page.matchingTwoPageWorkspace=true;
  page.inactivePageDimmed=true;
  const canvas=createCanvas(page.canvas.width,page.canvas.height);
  drawPaper(canvas.getContext('2d'),page);
  const ctx=canvas.getContext('2d');
  const left=[...ctx.getImageData(100,500,1,1).data];
  const right=[...ctx.getImageData(page.canvas.width-100,500,1,1).data];
  assert.notDeepEqual(right,left);
  page.inactivePageDimmed=false;
  drawPaper(ctx,page);
  assert.deepEqual([...ctx.getImageData(page.canvas.width-100,500,1,1).data],left);
});

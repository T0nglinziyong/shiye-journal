import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../src/domain.js';
import {matchingStageItems,matchingItemOnPage,applyMatchingStage} from '../src/matching-stage.js';

test('material page keeps measured size and dragged position in the editor',()=>{
  const asset={id:'sticker',title:'贴纸',physicalWidthMM:42,physicalHeightMM:59};
  const page=draft({mode:'single',ratio:'a4'});
  const stage=matchingStageItems([asset],{sticker:{x:.7,y:.4}},'a4','single');
  assert.equal(stage[0].width,.2);
  assert.equal(stage[0].height,59/297);
  applyMatchingStage(page,[asset],['sticker'],{sticker:{x:.7,y:.4}});
  assert.equal(page.items.length,1);
  assert.equal(page.items[0].x,page.canvas.width*.7);
  assert.equal(page.items[0].y,page.canvas.height*.4);
  assert.ok(Math.abs(page.items[0].width-page.canvas.height*42/297)<1e-10);
});

test('single and spread pages preserve distinct physical scale',()=>{
  const asset={id:'photo',physicalWidthMM:42,physicalHeightMM:59};
  const single=matchingStageItems([asset],{},'a4','single')[0];
  const spread=matchingStageItems([asset],{},'a4','spread')[0];
  assert.equal(single.width,spread.width*2);
  assert.equal(single.height,spread.height);
});

test('later material begins outside and becomes an editor standby item until moved onto the page',()=>{
  const assets=[{id:'first',physicalWidthMM:40,physicalHeightMM:40},
    {id:'later',physicalWidthMM:40,physicalHeightMM:40}];
  const stage=matchingStageItems(assets,{},'a4','single',['first']);
  assert.equal(stage[0].onPage,true);
  assert.equal(stage[1].onPage,false);
  assert.ok(stage[1].y>1);
  const parked=draft({ratio:'a4'});
  applyMatchingStage(parked,assets,['first','later'],{},['first']);
  assert.equal(parked.items[0].isParked,false);
  assert.equal(parked.items[1].isParked,true);
  const returned=draft({ratio:'a4'});
  applyMatchingStage(returned,assets,['first','later'],{later:{x:.7,y:.7}},['first']);
  assert.equal(returned.items[1].isParked,false);
});

test('initial batch is placed without overlapping when its measured pieces fit',()=>{
  const assets=Array.from({length:8},(_,index)=>({id:`asset-${index}`,physicalWidthMM:45,physicalHeightMM:45}));
  const items=matchingStageItems(assets,{},'a4','single',assets.map(asset=>asset.id));
  assert.ok(items.every(item=>item.onPage));
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
    const left=items[i],right=items[j];
    assert.ok(Math.abs(left.x-right.x)>=(left.width+right.width)/2||
      Math.abs(left.y-right.y)>=(left.height+right.height)/2);
  }
});

test('oversized and boundary-crossing material is standby',()=>{
  const oversized={id:'large',physicalWidthMM:240,physicalHeightMM:60};
  const item=matchingStageItems([oversized],{},'a4','single',['large'])[0];
  assert.equal(item.x,.5);
  assert.equal(item.y,1);
  assert.equal(item.onPage,false);
  assert.equal(matchingItemOnPage(.5,.5,1,.1),false);
  assert.equal(matchingItemOnPage(.5,.5,.9,.9),true);
  assert.equal(matchingItemOnPage(.1,.5,.2,.1),false);
  const page=draft({ratio:'a4'});
  applyMatchingStage(page,[oversized],['large'],{},['large']);
  assert.equal(page.items[0].isParked,true);
});

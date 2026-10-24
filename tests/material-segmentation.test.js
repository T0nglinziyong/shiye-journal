import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseClassicalSegmenter,insideOrientedBox} from '../src/material-segmentation.js';

test('validated default segmentation always uses MorphGAC after automatic box discovery',()=>{
  for(const box of [
    {boxAdjustment:'raw',fillRatio:.55,seedDensity:.6},
    {boxAdjustment:'dense-frame-body',fillRatio:.88,seedDensity:.5},
    {boxAdjustment:'pale-carrier-margin',fillRatio:.30,seedDensity:.08},
    {boxAdjustment:'pale-carrier-margin',fillRatio:.75,seedDensity:.92}
  ])assert.equal(chooseClassicalSegmenter(box),'morphgac');
});

test('rotated MorphGAC initializer includes turned corners but excludes old horizontal box',()=>{
  const o={centerX:.5,centerY:.5,width:.6,height:.12,rotation:30};
  assert.equal(insideOrientedBox(50,50,o,100,100),true);
  assert.equal(insideOrientedBox(72,63,o,100,100),true);
  assert.equal(insideOrientedBox(72,50,o,100,100),false);
  assert.equal(insideOrientedBox(50,80,o,100,100),false);
});
test('manual rotation updates which page pixels belong to the segmentation initializer',()=>{
  const o={centerX:.5,centerY:.5,width:.5,height:.1,rotation:0};
  assert.equal(insideOrientedBox(70,50,o,100,100),true);
  o.rotation=90;
  assert.equal(insideOrientedBox(70,50,o,100,100),false);
  assert.equal(insideOrientedBox(50,70,o,100,100),true);
});

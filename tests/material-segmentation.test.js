import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseClassicalSegmenter} from '../src/material-segmentation.js';

test('validated default segmentation always uses MorphGAC after automatic box discovery',()=>{
  for(const box of [
    {boxAdjustment:'raw',fillRatio:.55,seedDensity:.6},
    {boxAdjustment:'dense-frame-body',fillRatio:.88,seedDensity:.5},
    {boxAdjustment:'pale-carrier-margin',fillRatio:.30,seedDensity:.08},
    {boxAdjustment:'pale-carrier-margin',fillRatio:.75,seedDensity:.92}
  ])assert.equal(chooseClassicalSegmenter(box),'morphgac');
});

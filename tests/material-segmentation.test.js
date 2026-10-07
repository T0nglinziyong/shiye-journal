import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseClassicalSegmenter} from '../src/material-segmentation.js';

test('box-aware segmenter uses GrabCut for ordinary material boxes',()=>{
  assert.equal(chooseClassicalSegmenter({boxAdjustment:'raw',fillRatio:.55,seedDensity:.6},.72),'grabcut');
  assert.equal(chooseClassicalSegmenter({boxAdjustment:'dense-frame-body',fillRatio:.88,seedDensity:.5},.95),'grabcut');
});

test('box-aware segmenter uses MorphGAC for smooth pale carriers',()=>{
  assert.equal(chooseClassicalSegmenter({boxAdjustment:'pale-carrier-margin'},.92),'morphgac');
  assert.equal(chooseClassicalSegmenter({boxAdjustment:'pale-carrier-margin'},.8),'morphgac');
});

test('box-aware segmenter uses MorphACWE for freeform pale carriers',()=>{
  assert.equal(chooseClassicalSegmenter({boxAdjustment:'pale-carrier-margin'},.79),'morphacwe');
  assert.equal(chooseClassicalSegmenter({boxAdjustment:'pale-carrier-margin'},.55),'morphacwe');
});

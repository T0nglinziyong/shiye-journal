import test from 'node:test';
import assert from 'node:assert/strict';
import {materialSizeLabel} from '../src/material-size-label.js';

test('material cards display measured dimensions and used pieces show crop dimensions',()=>{
  const asset={physicalWidthMM:35.26,physicalHeightMM:18};
  assert.equal(materialSizeLabel(asset),'35.3 × 18 mm');
  assert.equal(materialSizeLabel(asset,{cropRect:{width:.5,height:.75}}),'17.6 × 13.5 mm');
  assert.equal(materialSizeLabel({physicalWidthMM:0,physicalHeightMM:18}),'');
});

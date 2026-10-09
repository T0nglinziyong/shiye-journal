import test from 'node:test';
import assert from 'node:assert/strict';
import {imageTier,imageVariant} from '../src/image-variants.js';

test('visible pixel size selects a bounded COS display tier',()=>{
  assert.equal(imageTier(160,2),360);
  assert.equal(imageTier(310,2),720);
  assert.equal(imageTier(560,2),1440);
  assert.equal(imageTier(900,2),2160);
  assert.equal(imageTier(6000,4),2160);
  assert.equal(imageVariant(721),'preview1440');
});

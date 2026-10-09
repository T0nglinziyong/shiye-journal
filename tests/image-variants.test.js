import test from 'node:test';
import assert from 'node:assert/strict';
import {imagePixelSize,imageVariant} from '../src/image-variants.js';

test('display edge follows CSS size and device pixels without fixed tiers',()=>{
  assert.equal(imagePixelSize(160,2),360);
  assert.equal(imagePixelSize(310,2),620);
  assert.equal(imagePixelSize(560,2),1120);
  assert.equal(imagePixelSize(900.2,2),1801);
  assert.equal(imagePixelSize(6000,4),4096);
  assert.equal(imageVariant(721),'preview721');
  assert.equal(imageVariant(410),'preview410');
  assert.equal(imageVariant(3),'preview360');
});

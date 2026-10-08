import test from 'node:test';
import assert from 'node:assert/strict';
import {hasDisplayP3Profile,displayP3ToSrgb} from '../src/recognition-raster.js';

test('Display P3 ICC marker and profile conversion preserve neutrals and correct chroma',()=>{
  const label=[...'Display P3'].flatMap(char=>[0,char.charCodeAt(0)]);
  const payload=[...'ICC_PROFILE\0'].map(char=>char.charCodeAt(0)).concat([1,1],label);
  const length=payload.length+2,jpeg=Uint8Array.from([255,216,255,226,length>>8,length&255,...payload,255,218]);
  assert.equal(hasDisplayP3Profile(jpeg),true);
  assert.equal(hasDisplayP3Profile(Uint8Array.from([255,216,255,218])),false);
  const pixels=new Uint8ClampedArray([230,230,230,255,91,103,115,255,244,190,130,255]);
  displayP3ToSrgb(pixels);
  assert.deepEqual([...pixels.slice(0,4)],[230,230,230,255]);
  assert.deepEqual([...pixels.slice(4,8)],[88,103,116,255]);
  assert.ok(pixels[8]>244&&pixels[9]<190,'P3 saturated samples should not be mislabeled as sRGB');
});

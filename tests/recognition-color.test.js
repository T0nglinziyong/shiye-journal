import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hasDisplayP3Profile,displayP3ToSrgb} from '../src/recognition-raster.js';

test('Display P3 ICC marker and profile conversion preserve neutrals and correct chroma',async()=>{
  const p3=await readFile(new URL('../cases/case3/raw_input.jpeg',import.meta.url)).catch(()=>null);
  if(p3)assert.equal(hasDisplayP3Profile(p3),true);
  const pixels=new Uint8ClampedArray([230,230,230,255,91,103,115,255,244,190,130,255]);
  displayP3ToSrgb(pixels);
  assert.deepEqual([...pixels.slice(0,4)],[230,230,230,255]);
  assert.deepEqual([...pixels.slice(4,8)],[88,103,116,255]);
  assert.ok(pixels[8]>244&&pixels[9]<190,'P3 saturated samples should not be mislabeled as sRGB');
});

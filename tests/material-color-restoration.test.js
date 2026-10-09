import test from 'node:test';
import assert from 'node:assert/strict';
import {lightMapFromPixels,lightGainAt,restoreRGBPixels,COLOR_MODES} from '../src/material-color-restoration.js';
import {softenOutputAlpha} from '../src/image.js';

const sheet=(w,h,base=195)=>{const rgba=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;rgba[i]=base+Math.round(x/w*15);rgba[i+1]=rgba[i]+2;rgba[i+2]=rgba[i]-2;rgba[i+3]=255;}
  return rgba;
};
test('A4 illumination raises photographed white without changing alpha or source pixels',()=>{
  const w=180,h=220,original=sheet(w,h),backup=original.slice();
  const map=lightMapFromPixels(original,w,h,[{x:.3,y:.2,w:.4,h:.5}]);
  assert.ok(map?.samples>40);
  const cut=new Uint8ClampedArray([195,197,193,255,144,153,159,96]);
  const restored=restoreRGBPixels(cut,2,1,map,80,90,w,h);
  assert.ok(restored[0]>cut[0]);assert.equal(restored[3],255);assert.equal(restored[7],96);
  assert.deepEqual(original,backup,'the recognition raster is immutable');
  assert.deepEqual([...cut],[195,197,193,255,144,153,159,96]);
});
test('no reliable neutral backing keeps RGB and mask untouched',()=>{
  const pixels=sheet(100,120,65),map=lightMapFromPixels(pixels,100,120,[]);
  assert.equal(map,null);const rgba=new Uint8ClampedArray([66,67,68,128]);
  assert.deepEqual(restoreRGBPixels(rgba,1,1,map),rgba);
});
test('illumination correction changes only colour and is spatially smooth',()=>{
  const w=140,h=180,map=lightMapFromPixels(sheet(w,h),w,h,[]);
  assert.ok(map);
  const left=lightGainAt(map,.49,.49),right=lightGainAt(map,.51,.49);
  assert.ok(Math.max(...left.map((v,i)=>Math.abs(v-right[i])))<.15);
  assert.deepEqual(COLOR_MODES,['original','auto']);
});

test('visual-only contour feathering does not mutate authoritative recognition mask',()=>{
  const mask=new Uint8Array([0,0,0,0,255,0,0,0,0]),before=mask.slice();
  const polished=softenOutputAlpha(mask,3,3);
  assert.deepEqual(mask,before);
  assert.notDeepEqual(polished,before);
});

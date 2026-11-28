import test from 'node:test';
import assert from 'node:assert/strict';
import {materialStorageSize,MATERIAL_LONG_EDGE_TIERS} from '../src/material-storage-resolution.js';

test('A4 pixel budget keeps the physical aspect ratio in either orientation',()=>{
  assert.deepEqual(materialStorageSize(2100,2970,210,297),{width:1018,height:1440});
  assert.deepEqual(materialStorageSize(2970,2100,297,210),{width:1440,height:1018});
  assert.deepEqual(materialStorageSize(1050,1485,105,148.5),{width:543,height:768});
});

test('material storage preserves raster ratio and never upscales small sources',()=>{
  assert.deepEqual(materialStorageSize(200,300,210,297),{width:200,height:300});
  assert.deepEqual(materialStorageSize(2000,1000,100,100),{width:512,height:256});
  assert.deepEqual(materialStorageSize(4000,3000,null,null),{width:1440,height:1080});
});

test('long edge uses discrete upward tiers across physical sizes',()=>{
  assert.deepEqual(MATERIAL_LONG_EDGE_TIERS,[256,384,512,768,1080,1440]);
  assert.deepEqual(materialStorageSize(3000,2000,297,420),{width:1440,height:960});
  assert.deepEqual(materialStorageSize(600,400,30,20),{width:256,height:171});
});

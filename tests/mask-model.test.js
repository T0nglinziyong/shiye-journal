import test from 'node:test';
import assert from 'node:assert/strict';
import {paintMask,maskOrientation,refineMaskStroke} from '../src/mask-model.js';

test('edge brush is a draft, uses diameter, and cannot restore absent source pixels',()=>{
  const mask=new Uint8ClampedArray(10000).fill(255);
  const erased=paintMask(mask,100,100,[{x:.5,y:.5}],.1,false);
  assert.equal(mask[5050],255);assert.equal(erased[5050],0);
  assert.equal(erased[5060],255);
  const source=new Uint8ClampedArray(10000).fill(127);
  assert.equal(paintMask(erased,100,100,[{x:.5,y:.5}],.1,true,source)[5050],127);
});

test('mask orientation preserves upright rectangles and handles empty input',()=>{
  assert.equal(maskOrientation(new Uint8ClampedArray(10000),100,100),null);
  const mask=new Uint8ClampedArray(10000);
  for(let y=40;y<60;y++)for(let x=20;x<80;x++)mask[y*100+x]=255;
  assert.ok(Math.abs(maskOrientation(mask,100,100))<.01);
});

test('stroke refinement changes only the recently painted neighborhood',()=>{
  const mask=new Uint8ClampedArray(10000).fill(255),data=new Uint8ClampedArray(40000).fill(255);
  const result=refineMaskStroke(mask,{width:100,height:100,data},{points:[{x:.5,y:.5}],ratio:.1});
  assert.ok(result.changed>0);assert.equal(result.mask[5050],0);
  assert.equal(result.mask[0],255);assert.equal(mask[5050],255);
});

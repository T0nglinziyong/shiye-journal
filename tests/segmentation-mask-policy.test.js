import test from 'node:test';
import assert from 'node:assert/strict';
import {selectMaterialMask} from '../src/segmentation-mask-policy.js';
test('model mask selection rejects confident background and tiny internal detail',()=>{
  const w=20,h=20,plane=w*h,masks=new Uint8Array(plane*3);masks.fill(1,0,plane);
  for(let y=5;y<15;y++)for(let x=5;x<15;x++)masks[plane+y*w+x]=1;
  masks[2*plane+10*w+10]=1;
  const before=masks.slice(),selected=selectMaterialMask(masks,[.999,.8,.99],w,h,[4,4,16,16]);
  assert.equal(selected.score,.8);assert.equal(selected.alpha[10*w+10],255);assert.equal(selected.alpha[0],0);assert.deepEqual(masks,before);
});
test('empty or out-of-box model predictions do not silently become material cuts',()=>{
  assert.equal(selectMaterialMask(new Uint8Array(400),[.99],20,20,[4,4,16,16]),null);
  assert.equal(selectMaterialMask(new Uint8Array(400).fill(1),[.99],20,20,[4,4,16,16]),null);
});

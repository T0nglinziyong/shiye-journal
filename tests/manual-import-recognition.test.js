import test from 'node:test';
import assert from 'node:assert/strict';
import {paddedRegion,chooseManualCandidate,refineManualBoxes} from '../src/manual-import-recognition.js';

test('manual box is a search hint; the detected masked material uses paper coordinates',()=>{
  const box={x:.3,y:.25,w:.3,h:.4},search=paddedRegion(box);
  const result=chooseManualCandidate(box,[
    {x:0,y:0,w:.1,h:.1,mask:{alpha:new Uint8Array([255])}},
    {x:.2,y:.18,w:.6,h:.62,mask:{alpha:new Uint8Array([255])}}
  ],search);
  assert.ok(result.mask);
  assert.ok(result.x>box.x-.05&&result.x<box.x+.08);
  assert.ok(result.w<box.w);
  assert.equal(chooseManualCandidate(box,[{x:0,y:0,w:.1,h:.1}],search),null);
});

test('unchanged candidates keep original cutout bytes; only edited boxes are re-recognized',async()=>{
  const region={x:.1,y:.1,w:.2,h:.3,mask:{alpha:new Uint8Array([255])}},original={region,blob:new Blob(['original'])};let calls=0;
  const boxes=[{x:.1,y:.1,w:.2,h:.3},{x:.5,y:.4,w:.1,h:.1}];
  const plan=await refineManualBoxes(boxes,[original],async box=>{calls++;return {...box,x:box.x+.01,w:box.w-.02,mask:{alpha:new Uint8Array([255])}};});
  assert.equal(calls,1);assert.equal(plan[0].original,original);assert.equal(plan[1].original,null);assert.equal(plan[1].region.x,.51);
  await assert.rejects(refineManualBoxes([{x:.6,y:.6,w:.1,h:.1}],[],async()=>null),/没有找到可靠素材/);
});

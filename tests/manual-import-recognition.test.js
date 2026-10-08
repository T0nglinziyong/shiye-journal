import test from 'node:test';
import assert from 'node:assert/strict';
import {refineManualBoxes,hasManualForegroundEvidence} from '../src/manual-import-recognition.js';

test('manual angle is authoritative: every edited box is segmented as a rotated instance',async()=>{
  const boxes=[{x:.2,y:.3,w:.2,h:.15,rotation:28},{x:.55,y:.6,w:.18,h:.13,rotation:-12}];
  const angles=[];
  const result=await refineManualBoxes(boxes,[],async box=>{
    angles.push(box.rotation);
    return {...box,orientedBox:{rotation:box.rotation,source:'manual'},mask:{width:2,height:2,alpha:new Uint8Array(4)}};
  });
  assert.deepEqual(angles,[28,-12]);
  assert.deepEqual(result.map(x=>x.region.orientedBox.rotation),[28,-12]);
  assert.ok(result.every(x=>x.original===null));
});

test('invalid manual rectangle and failed segmentation reject before saving',async()=>{
  await assert.rejects(refineManualBoxes([{x:0,y:0,w:0,h:.4}],[],async()=>({mask:{}})),/尺寸无效/);
  await assert.rejects(refineManualBoxes([{x:.2,y:.3,w:.2,h:.3,rotation:14}],[],async()=>null),/分割失败/);
});

test('manual box needs visible foreground variation before segmentation',()=>{
  const width=120,height=100,pixels=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<pixels.length;i+=4)pixels.set([255,255,255,255],i);
  const box={x:.12,y:.12,w:.3,h:.35};
  assert.equal(hasManualForegroundEvidence(pixels,width,height,box),false);
  for(let y=18;y<38;y++)for(let x=20;x<44;x++)pixels.set([165,94,72,255],(y*width+x)*4);
  assert.equal(hasManualForegroundEvidence(pixels,width,height,box),true);
  assert.equal(hasManualForegroundEvidence(pixels,width,height,{x:.6,y:.6,w:.2,h:.2}),false);
});

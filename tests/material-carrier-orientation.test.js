import test from 'node:test';
import assert from 'node:assert/strict';
import {separateSharedCarrier} from '../src/material-carrier.js';
import {orientedContourBox} from '../src/material-orientation.js';

test('separate setting removes a shared pale carrier without touching regular material',()=>{
  const width=80,height=60,pixels=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++)pixels.set([220,220,220,255],i*4);
  const dark=(x,y)=>{const at=(y*width+x)*4;pixels.set([110,105,100,255],at);};
  for(let y=12;y<44;y++)for(let x=12;x<58;x++){
    if(x<23&&y<34||x>=43&&y>=20)dark(x,y);
  }
  const candidate={x:10/width,y:10/height,w:50/width,h:40/height,fillRatio:.25,seedDensity:.1,
    mask:{width:50,height:40,alpha:new Uint8Array(50*40).fill(255)}};
  const pieces=separateSharedCarrier([candidate],pixels,width,height);
  assert.equal(pieces.length,2);
  for(const piece of pieces){
    assert.equal(piece.carrierMode,'separate');
    assert.equal(piece.orientedBox,null);
    assert.ok(piece.mask.alpha.some(Boolean));
    assert.ok(piece.w<candidate.w);
    assert.ok(piece.h<candidate.h);
  }
  assert.equal(separateSharedCarrier([{...candidate,shapeModel:'ellipse'}],pixels,width,height).length,1);
});

test('final oriented geometry uses the visible contour rather than the discovery box',()=>{
  const cv={minAreaRect:()=>({center:{x:25,y:30},size:{width:40,height:12},angle:20})};
  const box=orientedContourBox(cv,{},5,7,100,100,450,'quadrilateral');
  assert.equal(box.source,'final-mask');
  assert.equal(box.centerX,.3);
  assert.equal(box.centerY,.37);
  assert.equal(box.width,.4);
  assert.equal(box.height,.12);
  assert.equal(box.rotation,20);
  assert.equal(box.autoDeskew,true);
});

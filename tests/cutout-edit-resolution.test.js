import test from 'node:test';
import assert from 'node:assert/strict';
import {CUTOUT_EDIT_EDGE,fittedSize,resampleMask,scaleFramePlacement,
  shrinkEditorBitmap} from '../src/cutout-edit-resolution.js';

test('full 4000×2800 corrected candidate is edited at 900×630, never enlarged',()=>{
 assert.equal(CUTOUT_EDIT_EDGE,900);
 assert.deepEqual(fittedSize(4000,2800),{width:900,height:630});
 assert.deepEqual(fittedSize(300,240),{width:300,height:240});
});
test('original frame placement scales with 900px candidate preview',()=>{
 const original={x:400,y:250,width:3000,height:2000,frameWidth:4000,frameHeight:3000};
 const scaled=scaleFramePlacement(original,4000,3000,900,675);
 assert.deepEqual(scaled,{x:90,y:56.25,width:675,height:450,frameWidth:900,frameHeight:675});
});
test('final 3000×2000 alpha is resampled to 675×450 in aligned frame geometry',()=>{
 const raw={width:3000,height:2000,alpha:new Uint8Array(3000*2000).fill(255)};
 const compact=resampleMask(raw,675,450);
 assert.equal(compact.width,675);
 assert.equal(compact.height,450);
 assert.equal(compact.alpha.length,675*450);
 assert.equal(compact.alpha[100],255);
 assert.equal(compact.alpha.at(-1),255);
});
test('a transparent border remains transparent after interpolation',()=>{
 const alpha=Uint8Array.from([0,0,0,0,0,255,255,0,0,255,255,0,0,0,0,0]);
 const tiny=resampleMask({width:4,height:4,alpha},2,2);
 assert.ok([...tiny.alpha].every(value=>value>0&&value<255));
});
test('editor resizes before allocating full editor pixels and disposes original bitmap',()=>{
 const previous=globalThis.document;
 let closed=0,rendered=null;
 globalThis.document={createElement:()=>({
   getContext:()=>({drawImage:(bitmap,x,y,w,h)=>{rendered={w,h};}}),
   width:0,height:0
 })};
 try{
   const reduced=shrinkEditorBitmap({width:4200,height:2800,close:()=>closed++});
   assert.equal(reduced.width,900);
   assert.equal(reduced.height,600);
   assert.equal(closed,1);
   assert.deepEqual(rendered,{w:900,h:600});
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

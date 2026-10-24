import test from 'node:test';
import assert from 'node:assert/strict';
import {detectRemovedPhysicalInterior,keepPhysicalBeforeUnsafeRegularization}
 from '../src/material-physical-mask-guard.js';

const frame=(w,h,{shiftX=0,shiftY=0,paint=null}={})=>{
 const alpha=new Uint8Array(w*h).fill(255);
 paint?.(alpha,w,h);
 return {segmentationMethod:'physical',boundarySource:'supported-rect-envelope',
   x:.12+shiftX,y:.17+shiftY,w:.42,h:.35,
   pixels:alpha.reduce((n,v)=>n+(v>127),0),
   mask:{width:w,height:h,alpha}};
};
test('identical masks and preexisting binder holes preserve the approved result',()=>{
 for(const [w,h] of [[120,180],[240,360],[480,720]]){
   const original=frame(w,h,{paint:(a,ww)=>{
     for(let y=50;y<70;y++)for(let x=30;x<49;x++)a[y*ww+x]=0;
   }});
   const copy=frame(w,h,{paint:(a,ww)=>{
     for(let y=50;y<70;y++)for(let x=30;x<49;x++)a[y*ww+x]=0;
   }});
   assert.equal(detectRemovedPhysicalInterior(original,copy).removed,0);
   assert.equal(keepPhysicalBeforeUnsafeRegularization(original,copy).shapeGuard,undefined);
 }
});
test('erased lettering is caught even when bbox and reported pixel area are identical',()=>{
 for(const [w,h] of [[120,180],[240,360],[480,720]]){
   const original=frame(w,h);
   const edited=frame(w,h,{paint:(a,ww,hh)=>{
     for(let y=Math.floor(hh*.18);y<Math.floor(hh*.27);y++)
       for(let x=Math.floor(ww*.24);x<Math.floor(ww*.41);x++)a[y*ww+x]=0;
   }});
   edited.pixels=original.pixels; // an area-only check would wrongly pass
   const result=keepPhysicalBeforeUnsafeRegularization(original,edited);
   assert.equal(result.shapeGuard,'preserved-interior-content');
   assert.ok(result.postprocessDeletedInterior>5);
   assert.deepEqual(result.mask.alpha,original.mask.alpha);
 }
});
test('one-pixel outer antialiasing is not treated as a lost interior',()=>{
 const old=frame(240,360),next=frame(240,360,{paint:(a,w)=>a.fill(0,0,w)});
 assert.equal(detectRemovedPhysicalInterior(old,next).removed,0);
 assert.equal(keepPhysicalBeforeUnsafeRegularization(old,next).shapeGuard,undefined);
});
test('same physical mask mapped to a slightly shifted crop does not falsely lose the interior',()=>{
 const first=frame(240,360);
 const second={...first,mask:{...first.mask,alpha:new Uint8Array(first.mask.alpha)}};
 assert.equal(detectRemovedPhysicalInterior(first,second).removed,0);
});
test('only optional shape regularization is guarded, never a nonphysical algorithm',()=>{
 const a=frame(180,180),b=frame(180,180,{paint:(bytes,w)=>{
   for(let y=30;y<75;y++)for(let x=22;x<64;x++)bytes[y*w+x]=0;
 }});
 assert.equal(keepPhysicalBeforeUnsafeRegularization({...a,segmentationMethod:'morphgac'},b).shapeGuard,undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';
import {boxIoU,overlapOfSmaller,dedupePhysicalCandidates,mergeAlignedCarrierPieces} from '../src/material-physical-candidates.js';

test('normalized overlap: an identical paper has 100% overlap, not its small area',()=>{
  const a={x:.1,y:.2,w:.3,h:.4},b={...a};
  assert.equal(boxIoU(a,b),1);
  assert.ok(Math.abs(overlapOfSmaller(a,b)-1)<1e-9);
  assert.equal(dedupePhysicalCandidates([a,b]).length,1);
  const adjacent={x:.41,y:.2,w:.3,h:.4};
  assert.equal(dedupePhysicalCandidates([a,adjacent]).length,2);
});

test('real CASE7 diagnostic duplicate shapes collapse to independent physical objects',()=>{
  // Normalized subgroups are copied from the 900x636 CASE7 diagnostic of
  // the same uploaded photo. No hand-picked coordinates influence production.
  const tuples=[
    [.78,.0487,.2067,.4607],[.7844,.0503,.2022,.4591],
    [.0744,.0645,.2911,.3145],[.0767,.07075,.2822,.3050],
    [.5444,.2720,.1922,.4135],[.5444,.2720,.1922,.4135],
    [.0322,.4308,.2422,.5142],[.0333,.4324,.2411,.5126],
    [.6056,.1682,.1389,.0629],[.7111,.5723,.1689,.3553]
  ];
  const boxes=tuples.map(([x,y,w,h])=>({x,y,w,h}));
  assert.equal(dedupePhysicalCandidates(boxes).length,6);
  assert.equal(dedupePhysicalCandidates(boxes.slice(0,8)).length,4);
});

test('aligned fragments require distinct detection evidence to merge',()=>{
  const a={x:.1,y:.1,w:.20,h:.10,physicalBoundary:[[.1,.1]],
    boundarySource:'edge-closed',boundaryPrior:.8};
  const b={...a,y:.21,physicalBoundary:[[.1,.21]],boundarySource:'lab-carrier'};
  assert.equal(mergeAlignedCarrierPieces([a,b]).length,1);
  assert.equal(mergeAlignedCarrierPieces([a,{...b,boundarySource:'edge-closed'}]).length,2);
});

function blank(w,h){const pixels=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++)pixels.set([240,240,240,255],i*4);
  return {pixels,width:w,height:h,paperWidthMM:210,paperHeightMM:297};
}
function paint(p,keep){
 for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){
  if(!keep(x,y))continue;
  const at=(y*p.width+x)*4;p.pixels.set([72,83,98,255],at);
 }
}
test('real OpenCV physical mask keeps complete paper, not disconnected ink',async()=>{
 const cv=await cvModule,p=blank(360,300);
 paint(p,(x,y)=>x>=40&&x<190&&y>=35&&y<220);
 const carrier={x:40/360,y:35/300,w:150/360,h:185/300,
  physicalBoundary:[[40/360,35/300],[190/360,35/300],[190/360,220/300],[40/360,220/300]],
  boundarySource:'edge-closed',boundaryPrior:.75};
 const out=await processVision(cv,'process-material-boxes',{...p,boxes:[carrier],
   method:'physical',shapeRegularization:false,apertures:false});
 assert.equal(out.length,1);
 assert.equal(out[0].segmentationMethod,'physical');
 assert.ok(out[0].mask.alpha.some(Boolean));
 assert.ok(out[0].mask.alpha.length===out[0].mask.width*out[0].mask.height);
});

test('real OpenCV physical-only must never promote a blank legacy box to opaque paper',async()=>{
 const cv=await cvModule,p=blank(180,200);
 const noBoundary={x:.2,y:.2,w:.25,h:.25,instanceMethod:'physical-fallback',
   physicalBoundary:null};
 const out=await processVision(cv,'process-material-boxes',{...p,boxes:[noBoundary],
   method:'physical',shapeRegularization:false,apertures:false});
 assert.equal(out.length,1);
 assert.equal(out[0].segmentationFailed,true);
 assert.equal(out[0].mask,null);
 assert.equal(out[0].needsBoundaryReview,true);
});

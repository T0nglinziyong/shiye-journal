import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';
import {paperEnvelopeNeeded} from '../src/material-physical-segmentation.js';
import {keepPhysicalBeforeUnsafeRegularization} from '../src/material-physical-mask-guard.js';
import {boxIoU,overlapOfSmaller,dedupePhysicalCandidates,mergeAlignedCarrierPieces} from '../src/material-physical-candidates.js';

test('normalized overlap: an identical paper has 100% overlap, not its small area',()=>{
  const a={x:.1,y:.2,w:.3,h:.4},b={...a};
  assert.ok(Math.abs(boxIoU(a,b)-1)<1e-9);
  assert.ok(Math.abs(overlapOfSmaller(a,b)-1)<1e-9);
  assert.equal(dedupePhysicalCandidates([a,b]).length,1);
  const adjacent={x:.41,y:.2,w:.3,h:.4};
  assert.equal(dedupePhysicalCandidates([a,adjacent]).length,2);
});

test('real CASE7 47 detector outputs collapse to exactly eight physical regions',()=>{
  // Bounding coordinates copied from the uploaded BOX7 diagnostic; this is
  // a REAL failed recognition case, not synthetic randomly chosen overlaps.
  const tuples=[[0.741111,0.040881,0.245556,0.485849],[0.78,0.048742,0.206667,0.460692],[0.784444,0.050314,0.202222,0.459119],[0.784444,0.050314,0.202222,0.459119],[0.784444,0.050314,0.202222,0.459119],[0.784444,0.050314,0.202222,0.459119],[0.071111,0.062893,0.33,0.360063],[0.074444,0.064465,0.291111,0.314465],[0.076667,0.070755,0.282222,0.305031],[0.077778,0.070755,0.281111,0.305031],[0.404444,0.083333,0.157778,0.238994],[0.124444,0.086478,0.212222,0.061321],[0.41,0.095912,0.132222,0.224843],[0.41,0.099057,0.132222,0.221698],[0.785556,0.105346,0.188889,0.397799],[0.786667,0.108491,0.187778,0.394654],[0.786667,0.122642,0.187778,0.378931],[0.791111,0.122642,0.106667,0.185535],[0.124444,0.152516,0.157778,0.199686],[0.605556,0.168239,0.138889,0.062893],[0.538889,0.259434,0.212222,0.426101],[0.544444,0.272013,0.192222,0.413522],[0.544444,0.272013,0.192222,0.413522],[0.544444,0.272013,0.192222,0.402516],[0.544444,0.272013,0.192222,0.402516],[0.548889,0.27673,0.186667,0.389937],[0.553333,0.278302,0.181111,0.33805],[0.572222,0.295597,0.151111,0.06761],[0.564444,0.352201,0.154444,0.185535],[0.564444,0.352201,0.154444,0.183962],[0.024444,0.419811,0.25,0.525157],[0.032222,0.430818,0.242222,0.514151],[0.033333,0.43239,0.241111,0.512579],[0.033333,0.43239,0.241111,0.512579],[0.56,0.528302,0.151111,0.119497],[0.711111,0.572327,0.168889,0.355346],[0.711111,0.572327,0.168889,0.355346],[0.274444,0.573899,0.254444,0.34434],[0.711111,0.573899,0.162222,0.353774],[0.036667,0.575472,0.201111,0.363208],[0.301111,0.578616,0.221111,0.320755],[0.306667,0.584906,0.21,0.306604],[0.306667,0.584906,0.21,0.306604],[0.306667,0.584906,0.21,0.303459],[0.306667,0.584906,0.21,0.303459],[0.306667,0.584906,0.21,0.303459],[0.306667,0.586478,0.21,0.301887]];
  const boxes=tuples.map(([x,y,w,h])=>({x,y,w,h}));
  assert.equal(boxes.length,47);
  const unique=dedupePhysicalCandidates(boxes);
  assert.equal(unique.length,8,'47 repeated physical outlines must not become 45 material cards');
  // All eight retained subjects are distinct, and input order cannot
  // manufacture duplicate copies.
  for(let i=0;i<unique.length;i++)for(let j=i+1;j<unique.length;j++)
    assert.ok(overlapOfSmaller(unique[i],unique[j])<.8);
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

test('unverified legacy box remains visible as an editable, explicitly flagged rectangle',async()=>{
 const cv=await cvModule,p=blank(180,200);
 const noBoundary={x:.2,y:.2,w:.25,h:.25,instanceMethod:'physical-fallback',
   physicalBoundary:null};
 const out=await processVision(cv,'process-material-boxes',{...p,boxes:[noBoundary],
   method:'physical',shapeRegularization:false,apertures:false});
 assert.equal(out.length,1);
 assert.equal(out[0].segmentationFailed,false);
 assert.equal(out[0].segmentationMethod,'physical');
 assert.equal(out[0].boundarySource,'unverified-box');
 assert.equal(out[0].needsBoundaryReview,true);
 assert.ok(out[0].mask?.alpha?.some(v=>v===255));
 assert.equal(out[0].mask.alpha.length,out[0].mask.width*out[0].mask.height);
});

test('a full light paper receives rectangular envelope while an irregular person remains free-form',()=>{
 const square={boundarySource:'edge-closed',fillRatio:.91,
   physicalBoundary:[[.2,.2],[.7,.2],[.7,.6],[.2,.6]]};
 assert.equal(paperEnvelopeNeeded(square),true);
 assert.equal(paperEnvelopeNeeded({...square,fillRatio:.55}),false);
 assert.equal(paperEnvelopeNeeded({...square,boundarySource:'irregular-closed'}),false);
});

test('do not allow postprocessing to crop top letters or shrink a complete star sheet',()=>{
 const alpha=new Uint8Array(100*100).fill(255);
 const paper={segmentationMethod:'physical',boundarySource:'supported-rect-envelope',
   x:.1,y:.1,w:.4,h:.5,pixels:10000,mask:{width:100,height:100,alpha}};
 const cut={...paper,y:.12,h:.43,pixels:8200,mask:{width:100,height:100,alpha}};
 const result=keepPhysicalBeforeUnsafeRegularization(paper,cut);
 assert.equal(result.pixels,10000);
 assert.ok(['preserved-physical-perimeter','preserved-interior-content'].includes(result.shapeGuard));
 assert.equal(keepPhysicalBeforeUnsafeRegularization(paper,{...paper,pixels:9990}).pixels,9990);
});

test('physical Mask ROI must be row-packed: alpha matches complete raster area without stripes',async()=>{
 const cv=await cvModule,p=blank(480,360);
 paint(p,(x,y)=>x>=57&&x<285&&y>=46&&y<305);
 const carrier={x:57/480,y:46/360,w:228/480,h:259/360,
   physicalBoundary:[[57/480,46/360],[285/480,46/360],
     [285/480,305/360],[57/480,305/360]],
   boundarySource:'edge-closed',boundaryPrior:.9};
 const out=await processVision(cv,'process-material-boxes',{...p,
   boxes:[carrier],method:'physical',shapeRegularization:false,apertures:false});
 assert.equal(out.length,1);
 const result=out[0];
 const alpha=result.mask.alpha,w=result.mask.width,h=result.mask.height;
 assert.equal(alpha.length,w*h);
 const nonzero=alpha.reduce((n,value)=>n+(value>0),0);
 assert.equal(nonzero,result.pixels,
   'reading a strided ROI directly corrupts alpha and must never be used');
 for(const y of [5,Math.floor(h/2),h-6]){
   const row=alpha.subarray(y*w,(y+1)*w);
   assert.ok(row.reduce((n,value)=>n+(value>0),0)>=w*.94,
     'all three height bands must contain an unbroken filled paper');
 }
});

test('slanted real contour exports same number of pixels as rasterized OpenCV mask',async()=>{
 const cv=await cvModule,p=blank(480,360);
 const points=[[85,50],[307,67],[281,292],[60,275]];
 const outline=points.map(([x,y])=>[x/p.width,y/p.height]);
 const box={x:60/p.width,y:50/p.height,w:247/p.width,h:242/p.height,
   physicalBoundary:outline,boundarySource:'edge-closed',boundaryPrior:.8};
 const out=await processVision(cv,'process-material-boxes',{...p,
   boxes:[box],method:'physical',shapeRegularization:false,apertures:false});
 assert.equal(out.length,1);
 const result=out[0],alpha=result.mask.alpha;
 assert.equal(alpha.length,result.mask.width*result.mask.height);
 assert.equal(alpha.reduce((n,v)=>n+(v>0),0),result.pixels);
 assert.ok(result.h>box.h*.90,'a rotated paper must not become a thin horizontal strip');
});

test('a concave Canny paper outline must not cut the word Life from the paper',async()=>{
 const cv=await cvModule,p=blank(320,300);
 const pixels=[[40,40],[60,40],[60,100],[140,100],[140,40],
   [202,40],[202,256],[40,256]];
 const contour=pixels.map(([x,y])=>[x/p.width,y/p.height]);
 const paper={x:40/p.width,y:40/p.height,w:162/p.width,h:216/p.height,
   physicalBoundary:contour,boundarySource:'edge-closed',
   fillRatio:.86,boundaryPrior:.61};
 const results=await processVision(cv,'process-material-boxes',{
   ...p,boxes:[paper],method:'physical',
   shapeRegularization:false,apertures:false});
 assert.equal(results.length,1);
 const r=results[0];
 assert.equal(r.boundarySource,'supported-rect-envelope');
 assert.ok(r.mask?.alpha?.length);
 const px=Math.round(100-r.x*p.width),py=Math.round(60-r.y*p.height);
 assert.ok(px>=0&&px<r.mask.width&&py>=0&&py<r.mask.height);
 assert.ok(r.mask.alpha[py*r.mask.width+px]>=127,
   'top of a printed word must not be deleted by a concave Canny indent');
});

test('paper safeguard is applied before old aperture restoration',async()=>{
 const cv=await cvModule,p=blank(320,300);
 const box={x:40/320,y:30/300,w:175/320,h:210/300,
   physicalBoundary:[[40/320,30/300],[215/320,30/300],
     [215/320,240/300],[40/320,240/300]],
   fillRatio:.91,boundarySource:'edge-closed',boundaryPrior:.8};
 const result=await processVision(cv,'process-material-boxes',{...p,
   boxes:[box],method:'physical',shapeRegularization:true,apertures:false});
 assert.equal(result.length,1);
 assert.ok(result[0].mask?.alpha?.some(v=>v>127));
 assert.ok(result[0].h>=box.h*.94);
 assert.ok(result[0].w>=box.w*.94);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';
import {physicalPerimeterChoice,expandedSegmentationROI,SEGMENT_ROI_MARGIN_MM}
  from '../src/material-physical-perimeter.js';

test('restore first no-MOR mask selection policy on four physical image cases',()=>{
  const examples=[
    ['Life Wear letter card','edge-closed',.99,.95,.88,4,'observed-paper-convex'],
    ['star page','edge-closed',.99,.93,.97,4,'observed-paper-convex'],
    ['JOURNEY paper','edge-closed',.99,.86,.97,4,'observed-paper-convex'],
    ['person die-cut','irregular-closed',.75,.55,.77,5,'observed-freeform'],
    ['basketball players','irregular-closed',.81,.57,.75,6,'observed-freeform'],
    ['plate with disconnected food','irregular-closed',.84,.76,.59,9,'fragmented-carrier-hull'],
    ['verified oval label','ellipse-fit',.79,.77,.99,8,'observed-ellipse'],
    ['rotated blue star paper','lab-carrier',.94,.67,.82,9,'observed-chroma-hull'],
    ['unobserved ticket','legacy-uncovered',0,0,0,0,'unverified-rectangle']
  ];
  assert.equal(physicalPerimeterChoice({hasObserved:true,source:'ellipse-fit',
    ellipseAgreement:.92,vertices:12}), 'observed-freeform',
    'a rounded alarm clock with bells must keep observed free outline');
  for(const [name,source,rectFill,boxFill,solidity,vertices,want] of examples){
    const got=physicalPerimeterChoice({hasObserved:vertices>0,source,
      hullToMinRect:rectFill,hullToBox:boxFill,solidity,vertices});
    assert.equal(got,want,name);
  }
});
test('segmentation workspace really includes 3mm beyond candidate but remains on-page',()=>{
 assert.equal(SEGMENT_ROI_MARGIN_MM,3);
 const b={x:.20,y:.30,w:.25,h:.3};
 const region=expandedSegmentationROI(b,900,636,297,210);
 assert.ok(region.pad>=9);
 assert.ok(region.x0<Math.floor(b.x*900));
 assert.ok(region.x1>Math.ceil((b.x+b.w)*900));
 assert.ok(region.y0<Math.floor(b.y*636));
 assert.ok(region.y1>Math.ceil((b.y+b.h)*636));
 const edge=expandedSegmentationROI({x:0,y:0,w:.2,h:.2},900,636,297,210);
 assert.equal(edge.x0,0);assert.equal(edge.y0,0);
});
const image=(w,h)=>{
 const pixels=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<w*h;i++)pixels.set([225,225,222,255],4*i);
 return {pixels,width:w,height:h,paperWidthMM:297,paperHeightMM:210};
};
test('OpenCV whole rectangle restores upper Life letters, no MorphGAC and uses 3mm workspace',async()=>{
 const cv=await cvModule,p=image(450,318);
 const notch=[[40,40],[65,40],[65,105],[125,105],[125,40],[213,40],[213,273],[40,273]];
 const min={x:40/450,y:40/318,w:173/450,h:233/318,boundarySource:'edge-closed',
   fillRatio:.85,physicalBoundary:notch.map(([x,y])=>[x/450,y/318])};
 const [result]=await processVision(cv,'process-material-boxes',{
   ...p,boxes:[min],method:'physical',shapeRegularization:false,apertures:false
 });
 assert.equal(result.segmentationMethod,'physical');
 assert.equal(result.segmentationROIExtraMM,3);
 assert.equal(result.perimeterPolicy,'observed-paper-convex');
 const gx=100,gy=62,px=Math.round(gx-result.x*p.width),py=Math.round(gy-result.y*p.height);
 assert.ok(px>=0&&px<result.mask.width&&py>=0&&py<result.mask.height);
 assert.ok(result.mask.alpha[py*result.mask.width+px]>127,'Life must not be erased');
});
test('physical mode preserves unknown candidate and its review flag',async()=>{
 const cv=await cvModule,p=image(450,318),b={x:.35,y:.3,w:.12,h:.10,
  physicalBoundary:null,boundarySource:'legacy-uncovered'};
 const [result]=await processVision(cv,'process-material-boxes',{
   ...p,boxes:[b],method:'physical',shapeRegularization:false,apertures:false
 });
 assert.equal(result.perimeterPolicy,'unverified-rectangle');
 assert.equal(result.needsBoundaryReview,true);
 assert.ok(result.mask?.alpha?.some(v=>v>127));
});

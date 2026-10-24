import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {unifyCarrierCandidates} from '../src/unified-material-discovery.js';
import {mergeAlignedCarrierPieces,separateSupportedCarriers} from '../src/material-physical-candidates.js';
import {processVision} from '../src/opencv-worker.js';

test('unified carrier projection suppresses print fragments and recovers uncovered pieces',()=>{
  const carrier={x:.1,y:.1,w:.35,h:.5,physicalBoundary:[[.1,.1],[.45,.1],[.45,.6],[.1,.6]]},
    print={x:.2,y:.17,w:.06,h:.04},
    closePrint={x:.21,y:.61,w:.05,h:.025},
    separate={x:.55,y:.16,w:.13,h:.13},
    frameResidue={x:.84,y:.002,w:.14,h:.1};
  const result=unifyCarrierCandidates([carrier,frameResidue],[print,closePrint,separate]);
  assert.equal(result.length,2);
  assert.equal(result[0],carrier);
  assert.equal(result[1].boundarySource,'unified-uncovered');
  assert.equal(result[1].needsBoundaryReview,true);
});

test('two measured adjacent carriers can displace a colour hull joining both',()=>{
  const boundary=box=>[[box.x,box.y],[box.x+box.w,box.y],
    [box.x+box.w,box.y+box.h],[box.x,box.y+box.h]];
  const parent={x:.20,y:.20,w:.38,h:.52,boundaryPrior:.52};
  const top={x:.20,y:.20,w:.25,h:.28,boundaryPrior:.75};
  const bottom={x:.22,y:.46,w:.36,h:.26,boundaryPrior:.52};
  for(const box of [parent,top,bottom])box.physicalBoundary=boundary(box);
  assert.deepEqual(separateSupportedCarriers([parent,top,bottom]),[top,bottom]);
  const oneSheet={...parent,boundaryPrior:.89};
  assert.deepEqual(separateSupportedCarriers([oneSheet,top,bottom]),[oneSheet,top,bottom]);
});

test('new carrier alignment tolerance leaves the old physical path unchanged',()=>{
  const first={x:.48,y:.38,w:.37,h:.16,boundarySource:'edge-closed',physicalBoundary:[[.48,.38],[.85,.38],[.85,.54],[.48,.54]]};
  const second={x:.48,y:.49,w:.37,h:.15,boundarySource:'lab-carrier',physicalBoundary:[[.48,.49],[.85,.49],[.85,.64],[.48,.64]]};
  assert.equal(mergeAlignedCarrierPieces([first,second],900).length,2);
  assert.equal(mergeAlignedCarrierPieces([first,second],900,.36).length,1);
});

test('V5 mask arbitration ignores provenance when image evidence is identical',async()=>{
  const cv=await cvModule,width=160,height=120,pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,inside=x>=35&&x<125&&y>=25&&y<95;
    pixels.set(inside?[80,140,185,255]:[245,245,245,255],i);
  }
  const box={x:35/width,y:25/height,w:90/width,h:70/height,
    physicalBoundary:[[35/width,25/height],[125/width,25/height],[125/width,95/height],[35/width,95/height]]};
  const run=source=>processVision(cv,'process-material-boxes',{
    pixels,width,height,boxes:[{...box,source}],method:'unified',mergeSharedCarrier:true
  });
  const [automatic]=await run('auto'),[manual]=await run('manual');
  assert.equal(automatic.segmentationFailed,false);
  assert.equal(automatic.mask.alpha.length,automatic.mask.width*automatic.mask.height);
  assert.deepEqual(automatic.mask.alpha,manual.mask.alpha);
});

test('new manual search frame requires an observed boundary and does not hard-fill blank paper',async()=>{
  const cv=await cvModule,width=180,height=130,pixels=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++)pixels.set([245,245,245,255],i*4);
  const box={x:20/width,y:10/height,w:140/width,h:110/height,
    physicalBoundary:[[20/width,10/height],[160/width,10/height],[160/width,120/height],[20/width,120/height]]};
  const run=()=>processVision(cv,'process-material-boxes',{
    pixels,width,height,boxes:[box],method:'unified-manual',mergeSharedCarrier:true
  });
  const [blank]=await run();
  assert.equal(blank.segmentationFailed,true);
  assert.equal(blank.mask,null);
  for(let y=30;y<95;y++)for(let x=45;x<130;x++)pixels.set([70,125,190,255],(y*width+x)*4);
  const [found]=await run();
  assert.equal(found.segmentationFailed,false);
  assert.ok(found.mask?.alpha?.length>0);
  assert.ok(found.pixels<140*110*.8,'search frame should not become the final opaque mask');
});

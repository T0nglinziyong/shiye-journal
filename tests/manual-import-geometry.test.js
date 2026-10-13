import test from 'node:test';
import assert from 'node:assert/strict';
import {manualRotatedPolygon,manualPhysicalRegion}
  from '../src/manual-import-geometry.js';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';

const twiceArea=pts=>Math.abs(pts.reduce((a,p,i)=>{
 const q=pts[(i+1)%pts.length];return a+p[0]*q[1]-q[0]*p[1];
},0));
test('unrotated edit remains rectangle; positive angle preserves all four true corners',()=>{
 const box={x:.2,y:.3,w:.23,h:.32,rotation:0};
 const zero=manualRotatedPolygon(box,900,636);
 assert.equal(zero.length,4);
 assert.ok(Math.abs(twiceArea(zero)-2*box.w*box.h)<1e-8);
 const rotated=manualRotatedPolygon({...box,rotation:35},900,636);
 assert.equal(rotated.length,4);
 const xSpan=Math.max(...rotated.map(p=>p[0]))-Math.min(...rotated.map(p=>p[0]));
 assert.ok(xSpan>box.w*1.2,'manual rotated frame must not collapse to upright box');
 const areaRatio=twiceArea(rotated)/twiceArea(zero);
 assert.ok(Math.abs(areaRatio-1)<1e-8);
});
test('clipping rotated manual frame near page edge creates simple polygon inside image',()=>{
 const pts=manualRotatedPolygon({x:.02,y:.02,w:.20,h:.16,rotation:45},900,636);
 assert.ok(pts.length>=3&&pts.length<=8);
 for(const [x,y] of pts){assert.ok(x>=0&&x<=1&&y>=0&&y<=1);}
});
test('pixel aspect ratio is respected on portrait and landscape images',()=>{
 const b={x:.30,y:.30,w:.2,h:.10,rotation:90};
 const portrait=manualRotatedPolygon(b,469,664),landscape=manualRotatedPolygon(b,900,636);
 const pxw=(pts,W)=>W*(Math.max(...pts.map(p=>p[0]))-Math.min(...pts.map(p=>p[0])));
 assert.ok(Math.abs(pxw(portrait,469)-664*.10)<1e-7);
 assert.ok(Math.abs(pxw(landscape,900)-636*.10)<1e-7);
});
test('manual metadata is retained and never classified as detected Canny/chroma contour',()=>{
 const b={x:.2,y:.12,w:.3,h:.33,rotation:25};
 const m=manualPhysicalRegion(b,900,636);
 assert.equal(m.boundarySource,'manual-outline');
 assert.equal(m.orientedBox.rotation,25);
 assert.equal(m.orientedBox.autoDeskew,true);
 assert.equal(m.physicalBoundary.length,4);
});
test('real OpenCV worker keeps manually rotated alpha and bounding box',async()=>{
 const cv=await cvModule,w=360,h=250,pixels=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<pixels.length;i+=4){pixels[i]=180;pixels[i+1]=155;pixels[i+2]=125;pixels[i+3]=255;}
 const box={x:.2,y:.18,w:.25,h:.36,rotation:35},manual=manualPhysicalRegion(box,w,h);
 const [r]=await processVision(cv,'process-material-boxes',{pixels,
   boxes:[manual],width:w,height:h,method:'physical',paperWidthMM:297,
   paperHeightMM:210,shapeRegularization:false,apertures:false});
 assert.equal(r.perimeterPolicy,'observed-manual-polygon');
 assert.ok(r.mask?.alpha?.some(Boolean));
 assert.ok(r.w>box.w*1.1,'rotated bounds must be larger than upright input');
});

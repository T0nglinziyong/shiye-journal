import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCorners} from '../src/perspective.js';
import cvModule from '@techstark/opencv-js';

test('OpenCV projective transform keeps all four reference corners',async()=>{
  const cv=await cvModule;
  const from=[{x:0,y:0},{x:210,y:0},{x:210,y:297},{x:0,y:297}];
  const to=[{x:22,y:9},{x:241,y:30},{x:215,y:321},{x:4,y:275}];
  const a=cv.matFromArray(4,1,cv.CV_32FC2,from.flatMap(p=>[p.x,p.y])),b=cv.matFromArray(4,1,cv.CV_32FC2,to.flatMap(p=>[p.x,p.y])),h=cv.getPerspectiveTransform(a,b),out=new cv.Mat();
  try{cv.perspectiveTransform(a,out,h);for(let i=0;i<4;i++){assert.ok(Math.abs(out.data32F[i*2]-to[i].x)<.001);assert.ok(Math.abs(out.data32F[i*2+1]-to[i].y)<.001);}}finally{out.delete();h.delete();b.delete();a.delete();}
});
test('degenerate paper boundary is rejected',()=>{
  assert.throws(()=>validateCorners(Array(4).fill({x:.5,y:.5})));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {robustPaperLab} from '../src/paper-reference.js';

test('paper reference ignores one shadowed corner and inset warp border',async()=>{
  const cv=await cvModule,width=220,height=300,pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4,shadow=x<width*.14&&y<height*.12,material=x>70&&x<155&&y>95&&y<215;
    const color=material?[115,175,145]:shadow?[165,165,165]:[238,238,238];
    pixels.set([...color,255],p);
  }
  const rgba=cv.matFromArray(height,width,cv.CV_8UC4,pixels),rgb=new cv.Mat(),lab=new cv.Mat(),page=cv.Mat.zeros(height,width,cv.CV_8UC1);
  cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);
  const ref=robustPaperLab(lab,page,width,height);
  assert.ok(ref.L>220,'one dark corner must not drag the paper L reference down: '+JSON.stringify(ref));
  assert.ok(Math.abs(ref.a-128)<4&&Math.abs(ref.b-128)<4,JSON.stringify(ref));
  rgba.delete();rgb.delete();lab.delete();page.delete();
});

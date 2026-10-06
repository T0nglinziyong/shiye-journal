import test from 'node:test';
import assert from 'node:assert/strict';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';

function syntheticCard(){
  const width=180,height=200,pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4,inside=x>=42&&x<138&&y>=35&&y<165,border=inside&&(x<45||x>=135||y<38||y>=162);
    const c=!inside?[246,246,246]:border?[145,145,145]:[225,235,228];
    pixels.set([...c,255],at);
  }
  const x=48,y=42,w=84,h=112,alpha=new Uint8Array(w*h).fill(255);
  const candidate={x:x/width,y:y/height,w:w/width,h:h/height,edgeMethod:'seed',mask:{width:w,height:h,alpha,polygons:[]}};
  return {width,height,pixels,candidate};
}
function bboxIoU(a,b){
  const l=Math.max(a.x,b.x),t=Math.max(a.y,b.y),r=Math.min(a.x+a.w,b.x+b.w),d=Math.min(a.y+a.h,b.y+b.h);
  const inter=Math.max(0,r-l)*Math.max(0,d-t),union=a.w*a.h+b.w*b.h-inter;
  return inter/Math.max(1e-9,union);
}

for(const engine of ['grabcut','active-contour','morphgac','hybrid']){
  test('browser '+engine+' returns a stable physical refinement',async()=>{
    const cv=await cvModule,p=syntheticCard();
    const result=await processVision(cv,'refine-candidate',{...p,engine,paperWidthMM:210,paperHeightMM:297,maxNumIter:70,iterations:28});
    assert.ok(result,engine+' returned no region');
    assert.ok(result.refinementMetrics?.coverage>=.84,JSON.stringify(result.refinementMetrics));
    assert.ok(result.x>=0&&result.y>=0&&result.x+result.w<=1&&result.y+result.h<=1,JSON.stringify(result));
    assert.ok(bboxIoU(result,p.candidate)>=.70,engine+' lost the proposal: '+JSON.stringify({result,candidate:p.candidate}));
    assert.ok(Number.isFinite(result.refinementMetrics?.score),JSON.stringify(result.refinementMetrics));
  });
}

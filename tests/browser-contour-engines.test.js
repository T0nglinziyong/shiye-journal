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

for(const engine of ['grabcut','active-contour','morphgac','hybrid']){
  test('browser '+engine+' refines a physical carrier without losing its stable seed',async()=>{
    const cv=await cvModule,p=syntheticCard();
    const result=await processVision(cv,'refine-candidate',{...p,engine,paperWidthMM:210,paperHeightMM:297});
    assert.ok(result,engine+' returned no region');
    assert.ok(result.refinementMetrics?.coverage>=.88,JSON.stringify(result.refinementMetrics));
    assert.ok(result.x<.30&&result.x+result.w>.70,JSON.stringify({engine,x:result.x,w:result.w,metrics:result.refinementMetrics}));
    assert.ok(result.y<.25&&result.y+result.h>.78,JSON.stringify({engine,y:result.y,h:result.h,metrics:result.refinementMetrics}));
  });
}

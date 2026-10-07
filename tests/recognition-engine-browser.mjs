import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const b=await browserHarness('shiye-recognition-engine',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {evaluate,wait}=b;
try{
  await wait('.series-grid');
  await evaluate(`(()=>{
    const width=160,height=220,pixels=new Uint8ClampedArray(width*height*4);
    const backgroundConnected=new Uint8Array(width*height),evidence=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
    const x0=42,y0=34,x1=118,y1=188;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x,p=i*4,inside=x>=x0&&x<x1&&y>=y0&&y<y1;
      const edge=inside&&(x-x0<3||x1-1-x<3||y-y0<3||y1-1-y<3);
      const color=inside?(edge?[105,145,185]:[126,174,210]):[246,246,246];
      pixels[p]=color[0];pixels[p+1]=color[1];pixels[p+2]=color[2];pixels[p+3]=255;
      backgroundConnected[i]=inside?0:1;if(inside){evidence[i]=1;score[i]=edge?110:75;}
    }
    const alpha=new Uint8Array((x1-x0)*(y1-y0)).fill(255);
    globalThis.__recogFixture={width,height,pixels,backgroundConnected,evidence,shadowLikelihood,score,candidate:{x:x0/width,y:y0/height,w:(x1-x0)/width,h:(y1-y0)/height,pixels:(x1-x0)*(y1-y0),recognitionConfidence:.5,mask:{width:x1-x0,height:y1-y0,alpha,polygons:[]}}};
    return true;
  })()`);
  const mainOpenCV=await evaluate(`(async()=>{const m=await import('/src/opencv-readiness-probe.js');return await m.probeOpenCVMainThread()})()`);
  console.log('Chrome engine step: main OpenCV',JSON.stringify(mainOpenCV));assert.equal(mainOpenCV.ready,true,JSON.stringify(mainOpenCV));
  await evaluate(`(async()=>{const m=await import('/src/vision-runtime.js');globalThis.__visionTask=m.visionTask;return true})()`);
  console.log('Chrome engine step: module imported');

  const warm=await evaluate(`(async()=>{const t=performance.now(),result=await __visionTask('warmup',{});return {elapsedMS:performance.now()-t,result}})()`);
  console.log('Chrome engine step: warmup',JSON.stringify(warm));assert.equal(warm.result.ready,true);

  const runRefine=async mode=>{
    const result=await evaluate(`(async()=>{const f=__recogFixture,t=performance.now(),[r]=await __visionTask('material-boundary-refine',{pixels:f.pixels,width:f.width,height:f.height,candidates:[f.candidate],mode:${JSON.stringify(mode)}});return {elapsedMS:performance.now()-t,edgeMethod:r?.edgeMethod||null,pixels:r?.pixels||0,width:r?.mask?.width||0,height:r?.mask?.height||0}})()`);
    console.log('Chrome engine step:',mode,JSON.stringify(result));return result;
  };
  const grabcut=await runRefine('grabcut');assert.equal(grabcut.edgeMethod,'browser-grabcut',JSON.stringify(grabcut));
  const active=await runRefine('active');assert.equal(active.edgeMethod,'browser-active-contour',JSON.stringify(active));
  const morphgac=await runRefine('morphgac');assert.equal(morphgac.edgeMethod,'browser-morphgac',JSON.stringify(morphgac));
  const hybrid=await runRefine('hybrid');assert.equal(hybrid.edgeMethod,'browser-morphgac-grabcut',JSON.stringify(hybrid));
  for(const result of [grabcut,active,morphgac,hybrid])assert.ok(result.pixels>100&&result.width>10&&result.height>10,JSON.stringify(result));

  const fast=await evaluate(`(async()=>{const f=__recogFixture,t=performance.now(),r=await __visionTask('materials-fast',{pixels:f.pixels,width:f.width,height:f.height,backgroundConnected:f.backgroundConnected,evidence:f.evidence,shadowLikelihood:f.shadowLikelihood,score:f.score,smallestMM:6,paperWidthMM:210,paperHeightMM:297,rectified:true});return {elapsedMS:performance.now()-t,count:r.length,methods:r.map(x=>x.edgeMethod)}})()`);
  console.log('Chrome engine step: fast',JSON.stringify(fast));assert.ok(fast.count>=1,JSON.stringify(fast));
  assert.deepEqual(b.errors,[]);
}finally{try{await b.close();}catch(error){console.warn('Browser close warning:',String(error?.message||error));}}

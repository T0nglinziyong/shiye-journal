import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {browserHarness} from './browser-harness.mjs';

const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5192';
const browser=await browserHarness('shiye-recognition-engines',url);
try{
  await browser.wait('body');
  const results=await browser.evaluate(`(async()=>{
    const {visionTask}=await import('/src/vision-runtime.js');
    const width=180,height=200,pixels=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const at=(y*width+x)*4,inside=x>=42&&x<138&&y>=35&&y<165,border=inside&&(x<45||x>=135||y<38||y>=162);
      const c=!inside?[246,246,246]:border?[145,145,145]:[225,235,228];pixels.set([...c,255],at);
    }
    const x=48,y=42,w=84,h=112,alpha=new Uint8Array(w*h).fill(255);
    const candidate={x:x/width,y:y/height,w:w/width,h:h/height,edgeMethod:'seed',mask:{width:w,height:h,alpha,polygons:[]}};
    const out={};
    for(const engine of ['grabcut','active-contour','morphgac','hybrid']){
      const started=performance.now();
      const region=await visionTask('refine-candidate',{engine,pixels,width,height,candidate,paperWidthMM:210,paperHeightMM:297});
      out[engine]={elapsedMS:performance.now()-started,region:{x:region.x,y:region.y,w:region.w,h:region.h,edgeMethod:region.edgeMethod,metrics:region.refinementMetrics}};
    }
    return out;
  })()`);
  for(const [engine,r] of Object.entries(results)){
    assert.ok(r.region,engine+' missing region');
    assert.ok(r.region.metrics.coverage>=.88,engine+' seed coverage '+JSON.stringify(r.region.metrics));
    assert.ok(r.elapsedMS<20000,engine+' took '+r.elapsedMS+' ms in Chromium');
  }
  const report=process.env.SHIYE_RECOGNITION_REPORT;
  if(report){await mkdir(dirname(report),{recursive:true});await writeFile(report,JSON.stringify(results,null,2));}
  console.log('Recognition browser engines:',JSON.stringify(results));
  assert.deepEqual(browser.errors,[]);
}finally{await browser.close();}

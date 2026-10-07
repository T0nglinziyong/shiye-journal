import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const b=await browserHarness('shiye-recognition-engine',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {evaluate,wait}=b;
try{
  await wait('.series-grid');
  await evaluate(`(()=>{
    const width=160,height=220,pixels=new Uint8ClampedArray(width*height*4),x0=42,y0=34,x1=118,y1=188;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x,p=i*4,inside=x>=x0&&x<x1&&y>=y0&&y<y1,
        edge=inside&&(x-x0<3||x1-1-x<3||y-y0<3||y1-1-y<3),
        color=inside?(edge?[105,145,185]:[126,174,210]):[246,246,246];
      pixels[p]=color[0];pixels[p+1]=color[1];pixels[p+2]=color[2];pixels[p+3]=255;
    }
    globalThis.__recogFixture={width,height,pixels,box:{x:x0/width,y:y0/height,w:(x1-x0)/width,h:(y1-y0)/height,pixels:(x1-x0)*(y1-y0),fillRatio:.96,seedDensity:.7}};
    return true;
  })()`);
  await evaluate(`(async()=>{const m=await import('/src/vision-runtime.js');globalThis.__visionTask=m.visionTask;return true})()`);
  console.log('Chrome engine step: module imported');

  const warm=await evaluate(`(async()=>{const t=performance.now(),result=await __visionTask('warmup',{});return {elapsedMS:performance.now()-t,result}})()`);
  console.log('Chrome engine step: warmup',JSON.stringify(warm));assert.equal(warm.result.ready,true);

  const run=async method=>{
    const result=await evaluate(`(async()=>{const f=__recogFixture,t=performance.now(),[r]=await __visionTask('process-material-boxes',{pixels:f.pixels,sourcePixels:f.pixels,width:f.width,height:f.height,boxes:[f.box],method:${JSON.stringify(method)},paperWidthMM:210,paperHeightMM:297,shapeRegularization:false,apertures:false});return {elapsedMS:performance.now()-t,edgeMethod:r?.edgeMethod||null,pixels:r?.pixels||0,width:r?.mask?.width||0,height:r?.mask?.height||0}})()`);
    console.log('Chrome final engine step:',method,JSON.stringify(result));return result;
  };

  const morph=await run('morphgac');assert.equal(morph.edgeMethod,'morphgac',JSON.stringify(morph));
  const grabcut=await run('grabcut');assert.equal(grabcut.edgeMethod,'browser-grabcut',JSON.stringify(grabcut));
  const hybrid=await run('hybrid');assert.equal(hybrid.edgeMethod,'browser-morphgac-grabcut',JSON.stringify(hybrid));
  for(const result of [morph,grabcut,hybrid])assert.ok(result.pixels>100&&result.width>10&&result.height>10,JSON.stringify(result));
  assert.deepEqual(b.errors,[]);
}finally{try{await b.close();}catch(error){console.warn('Browser close warning:',String(error?.message||error));}}

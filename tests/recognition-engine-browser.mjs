import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const b=await browserHarness('shiye-recognition-engine',process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
const {evaluate,wait}=b;
try{
  await wait('.series-grid');
  const result=await evaluate(`(async()=>{
    const {visionTask}=await import('/src/vision-runtime.js');
    const width=160,height=220,pixels=new Uint8ClampedArray(width*height*4);
    const backgroundConnected=new Uint8Array(width*height),evidence=new Uint8Array(width*height),shadowLikelihood=new Uint8Array(width*height),score=new Uint8Array(width*height);
    const x0=42,y0=34,x1=118,y1=188;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x,p=i*4,inside=x>=x0&&x<x1&&y>=y0&&y<y1;
      const edge=inside&&(x-x0<3||x1-1-x<3||y-y0<3||y1-1-y<3);
      const color=inside?(edge?[105,145,185]:[126,174,210]):[246,246,246];
      pixels[p]=color[0];pixels[p+1]=color[1];pixels[p+2]=color[2];pixels[p+3]=255;
      backgroundConnected[i]=inside?0:1;
      if(inside){evidence[i]=1;score[i]=edge?110:75;}
    }
    const warmStarted=performance.now();await visionTask('warmup',{});const warmMS=performance.now()-warmStarted;
    const alpha=new Uint8Array((x1-x0)*(y1-y0)).fill(255);
    const candidate={x:x0/width,y:y0/height,w:(x1-x0)/width,h:(y1-y0)/height,pixels:(x1-x0)*(y1-y0),recognitionConfidence:.5,mask:{width:x1-x0,height:y1-y0,alpha,polygons:[]}};
    const modes=['grabcut','active','quality','hybrid'],out={warmMS};
    for(const mode of modes){
      const started=performance.now();
      const [region]=await visionTask('material-boundary-refine',{pixels,width,height,candidates:[candidate],mode});
      out[mode]={elapsedMS:performance.now()-started,edgeMethod:region?.edgeMethod||null,pixels:region?.pixels||0,width:region?.mask?.width||0,height:region?.mask?.height||0};
    }
    const fastStarted=performance.now();
    const fast=await visionTask('materials-fast',{pixels,width,height,backgroundConnected,evidence,shadowLikelihood,score,smallestMM:6,paperWidthMM:210,paperHeightMM:297,rectified:true});
    out.fast={elapsedMS:performance.now()-fastStarted,count:fast.length,methods:fast.map(x=>x.edgeMethod)};
    return out;
  })()`);
  console.log('Real Chrome recognition engine raw:',JSON.stringify(result));
  assert.ok(result.warmMS<60000,JSON.stringify(result));
  assert.ok(result.fast.count>=1,JSON.stringify(result));
  assert.equal(result.grabcut.edgeMethod,'browser-grabcut',JSON.stringify(result));
  assert.equal(result.active.edgeMethod,'browser-active-contour',JSON.stringify(result));
  assert.equal(result.quality.edgeMethod,'browser-morphgac',JSON.stringify(result));
  assert.ok(['browser-active-contour','browser-morphgac'].includes(result.hybrid.edgeMethod),JSON.stringify(result));
  for(const key of ['grabcut','active','quality','hybrid'])assert.ok(result[key].pixels>100&&result[key].width>10&&result[key].height>10,JSON.stringify(result));
  assert.deepEqual(b.errors,[]);
  console.log('Real Chrome recognition engine:',JSON.stringify(result));
}finally{try{await b.close();}catch(error){console.warn('Browser close warning:',String(error?.message||error));}}

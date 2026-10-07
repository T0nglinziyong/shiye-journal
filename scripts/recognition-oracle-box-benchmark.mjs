import fs from 'node:fs';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';

const [, ,inputPath,outputPath]=process.argv;
if(!inputPath||!outputPath)throw Error('usage: recognition-oracle-box-benchmark.mjs input.json output.json');
const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const source=Buffer.from(input.rgbaBase64||'','base64');
if(source.length!==input.width*input.height*4)throw Error('RGBA byte length mismatch');

const cv=await cvModule;
const maxDim=Number(input.analysisMaxDimension)||900;
const ratio=Math.min(1,maxDim/Math.max(input.width,input.height));
const width=Math.max(1,Math.round(input.width*ratio)),height=Math.max(1,Math.round(input.height*ratio));
const src=cv.matFromArray(input.height,input.width,cv.CV_8UC4,new Uint8ClampedArray(source)),scaled=new cv.Mat();
if(width===input.width&&height===input.height)src.copyTo(scaled);
else cv.resize(src,scaled,new cv.Size(width,height),0,0,cv.INTER_AREA);
src.delete();
const pixels=new Uint8ClampedArray(scaled.data);scaled.delete();

const candidates=(input.items||[]).map(item=>{
  const [x1,y1,x2,y2]=item.bbox;
  const nx=x1/input.width,ny=y1/input.height,nw=(x2-x1)/input.width,nh=(y2-y1)/input.height,
    mw=Math.max(1,Math.round(nw*width)),mh=Math.max(1,Math.round(nh*height));
  return {
    id:item.id,name:item.name,x:nx,y:ny,w:nw,h:nh,pixels:mw*mh,
    recognitionConfidence:.5,edgeMethod:'oracle-box',
    mask:{width:mw,height:mh,alpha:new Uint8Array(mw*mh).fill(255),polygons:[]}
  };
});

const modes=['grabcut','active','morphgac','hybrid'];
const postOff={edgePolish:false,shapeRegularization:false,curveSmooth:false,apertures:false};
const results={width,height,ratio,analysisMaxDimension:maxDim,items:input.items,modes:{}};

for(const mode of modes){
  const started=performance.now();
  const out=await processVision(cv,'material-boundary-refine',{
    pixels,width,height,candidates,mode,postprocess:postOff,chromaEdges:true
  });
  results.modes[mode]={
    elapsedMS:performance.now()-started,
    candidates:out.map((candidate,index)=>({
      id:input.items[index]?.id,name:input.items[index]?.name,
      ...candidate,
      mask:candidate.mask?{
        ...candidate.mask,
        alphaBase64:Buffer.from(candidate.mask.alpha).toString('base64'),
        alpha:undefined
      }:null
    }))
  };
}

fs.writeFileSync(outputPath,JSON.stringify(results));

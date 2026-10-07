import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';
import {buildForegroundEvidence} from '../src/foreground-evidence.js';
import {attachBoundaryHints} from '../src/recognition-boundary-hints.js';

// Offline exact-harness for private recognition acceptance images.
//
// It mirrors the instance-first browser auto pipeline without requiring a DOM
// Worker. Private image bytes stay local; GitHub only provides code/deps.
//
// Usage:
//   node scripts/recognition-real-case-runner.mjs input.json output.json
//
// input.json:
//   {"width":900,"height":1273,"rgbaBase64":"...","analysisMaxDimension":900}

const [, ,inputPath,outputPath]=process.argv;
if(!inputPath||!outputPath)throw Error('usage: recognition-real-case-runner.mjs input.json output.json');
const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const source=Buffer.from(input.rgbaBase64||'','base64');
if(source.length!==input.width*input.height*4)throw Error('RGBA byte length mismatch');

const cv=await cvModule,totalStarted=performance.now(),timings={};
const time=async(name,fn)=>{
  const started=performance.now(),result=await fn();
  timings[name]=performance.now()-started;return result;
};

const analysisMaxDimension=Number(input.analysisMaxDimension)||900,
  ratio=Math.min(1,analysisMaxDimension/Math.max(input.width,input.height)),
  width=Math.max(1,Math.round(input.width*ratio)),
  height=Math.max(1,Math.round(input.height*ratio));

const sourcePixels=await time('resize',async()=>{
  const sourceMat=cv.matFromArray(input.height,input.width,cv.CV_8UC4,new Uint8ClampedArray(source)),
    analysisMat=new cv.Mat();
  if(width===input.width&&height===input.height)sourceMat.copyTo(analysisMat);
  else cv.resize(sourceMat,analysisMat,new cv.Size(width,height),0,0,cv.INTER_AREA);
  const pixels=new Uint8ClampedArray(analysisMat.data);
  sourceMat.delete();analysisMat.delete();return pixels;
});

const preprocess={illumination:true,denoise:true,localContrast:true,chromaEdges:true},
  postprocess={edgePolish:true,shapeRegularization:true,curveSmooth:true,apertures:true},
  balanced=await time('preprocess',()=>processVision(cv,'balance',{pixels:sourcePixels,width,height,options:preprocess})),
  data=balanced.pixels,
  paperWidthMM=Number(input.paperWidthMM)||210,
  paperHeightMM=Number(input.paperHeightMM)||297,
  smallestMM=Number(input.smallestMM)||6,
  pxPerMM=((width/paperWidthMM)+(height/paperHeightMM))/2,
  cellSize=Math.max(24,Math.round(pxPerMM*13.5)),
  evidence=await time('evidence',async()=>buildForegroundEvidence(data,width,height,{sourcePixels,cellSize}));

const instances=await time('instancesSimple',()=>processVision(cv,'instances-simple',{
  mask:evidence.mask,evidence:evidence.evidence,foregroundSeeds:evidence.foregroundSeeds,
  width,height,smallestMM,paperWidthMM,paperHeightMM
}));

const enclosures=await time('enclosures',()=>processVision(cv,'enclosures',{
  pixels:data,evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
  shadowLikelihood:evidence.shadowLikelihood,score:evidence.score,
  width,height,smallestMM,paperWidthMM,paperHeightMM,chromaEdges:true,postprocess
}));

let candidates=attachBoundaryHints(instances,enclosures);

await time('localCompletion',async()=>{
  for(let index=0;index<candidates.length;index++){
    const candidate=candidates[index],
      fill=candidate.identityFillRatio??candidate.fillRatio??0,
      needsCompletion=!candidate.boundaryHint
        &&candidate.touchesProtectedFrame===true
        &&fill>=.70;
    if(!needsCompletion)continue;
    const completed=await processVision(cv,'complete-boundaries',{
      pixels:sourcePixels,width,height,candidates:[candidate],
      smallestMM,paperWidthMM,paperHeightMM,
      evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
      shadowLikelihood:evidence.shadowLikelihood,chromaEdges:true,postprocess
    });
    if(completed?.[0])candidates[index]={...completed[0],boundaryFinalized:true,boundaryCompletion:'frame-high-fill'};
  }
});

const selected=[],indices=[];
for(let i=0;i<candidates.length;i++){
  if(candidates[i].boundaryFinalized)continue;
  selected.push(candidates[i]);indices.push(i);
}
if(selected.length){
  const refined=await time('postprocess',()=>processVision(cv,'material-boundary-refine',{
    pixels:sourcePixels,width,height,candidates:selected,mode:'postprocess',
    postprocess,chromaEdges:true
  }));
  const out=[...candidates];
  for(let i=0;i<indices.length;i++)out[indices[i]]=refined[i]||selected[i];
  candidates=out;
}else timings.postprocess=0;

const encodeMask=mask=>mask?{
  ...mask,
  alphaBase64:mask.alpha?Buffer.from(mask.alpha).toString('base64'):undefined,
  alpha:undefined
}:null;
const serializable=candidates.sort((a,b)=>a.y-b.y||a.x-b.x).map(candidate=>({
  ...candidate,
  mask:encodeMask(candidate.mask),
  contentMask:encodeMask(candidate.contentMask)
}));
timings.total=performance.now()-totalStarted;

fs.writeFileSync(outputPath,JSON.stringify({
  inputWidth:input.width,inputHeight:input.height,width,height,ratio,
  instanceCount:instances.length,enclosureCount:enclosures.length,
  finalCount:serializable.length,timings,candidates:serializable
}));

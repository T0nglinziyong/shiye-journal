import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';
import {buildForegroundEvidence} from '../src/foreground-evidence.js';
import {fuseRecognitionCandidates} from '../src/recognition-fusion.js';

// Fair comparison of the original classical boundary engines.
// Every mode receives exactly the same discovered candidates and source image.
// No later experimental carrier recovery / instance-first logic is involved.

const [, ,inputPath,outputPath]=process.argv;
if(!inputPath||!outputPath)throw Error('usage: segmentation-engine-benchmark.mjs input.json output.json');
const input=JSON.parse(fs.readFileSync(inputPath,'utf8')),source=Buffer.from(input.rgbaBase64||'','base64');
if(source.length!==input.width*input.height*4)throw Error('RGBA byte length mismatch');

const cv=await cvModule,maxDim=Number(input.analysisMaxDimension)||900,
  ratio=Math.min(1,maxDim/Math.max(input.width,input.height)),
  width=Math.max(1,Math.round(input.width*ratio)),height=Math.max(1,Math.round(input.height*ratio)),
  paperWidthMM=Number(input.paperWidthMM)||210,paperHeightMM=Number(input.paperHeightMM)||297,
  smallestMM=Number(input.smallestMM)||6,timings={};
const time=async(name,fn)=>{const started=performance.now(),v=await fn();timings[name]=performance.now()-started;return v;};

const sourcePixels=await time('resize',async()=>{
  const src=cv.matFromArray(input.height,input.width,cv.CV_8UC4,new Uint8ClampedArray(source)),dst=new cv.Mat();
  if(width===input.width&&height===input.height)src.copyTo(dst);
  else cv.resize(src,dst,new cv.Size(width,height),0,0,cv.INTER_AREA);
  const pixels=new Uint8ClampedArray(dst.data);src.delete();dst.delete();return pixels;
});
const processed=await time('balance',()=>processVision(cv,'balance',{
  pixels:sourcePixels,width,height,options:{illumination:true,denoise:true,localContrast:true}
}));
const data=processed.pixels,pxPerMM=((width/paperWidthMM)+(height/paperHeightMM))/2,
  cellSize=Math.max(24,Math.round(pxPerMM*13.5)),
  evidence=await time('evidence',async()=>buildForegroundEvidence(data,width,height,{sourcePixels,cellSize}));

// Reproduce the original clean test candidate-discovery path exactly.
const fast=await time('fast',()=>processVision(cv,'materials-fast',{
  pixels:data,width,height,smallestMM,paperWidthMM,paperHeightMM,
  evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
  shadowLikelihood:evidence.shadowLikelihood,score:evidence.score,rectified:true,chromaEdges:true,
  postprocess:{shapeRegularization:false,curveSmooth:false,apertures:false}
}));
let base;
if(fast.length&&fast.length<=12&&fast.every(candidate=>(candidate.recognitionConfidence??0)>=.54)){
  base=fast;
  timings.discoveryPath='fast';
}else{
  const instances=await time('instances',()=>processVision(cv,'instances',{
    mask:evidence.mask,evidence:evidence.evidence,foregroundSeeds:evidence.foregroundSeeds,
    shadowLikelihood:evidence.shadowLikelihood,pixels:sourcePixels,
    width,height,smallestMM,paperWidthMM,paperHeightMM
  }));
  const structural=await time('enclosures',()=>processVision(cv,'enclosures',{
    pixels:data,evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
    shadowLikelihood:evidence.shadowLikelihood,score:evidence.score,
    width,height,smallestMM,paperWidthMM,paperHeightMM
  }));
  const reconstructed=instances.length?await time('reconstruction',()=>processVision(cv,'boundary-reconstruction',{
    pixels:data,instances,evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
    shadowLikelihood:evidence.shadowLikelihood,score:evidence.score,
    width,height,smallestMM,paperWidthMM,paperHeightMM
  })):[];
  const fused=fuseRecognitionCandidates(instances,[...structural,...reconstructed]);
  base=fused.length?await time('completion',()=>processVision(cv,'complete-boundaries',{
    pixels:sourcePixels,width,height,candidates:fused,smallestMM,paperWidthMM,paperHeightMM,
    evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
    shadowLikelihood:evidence.shadowLikelihood
  })):fused;
  timings.discoveryPath='slow';
}

const cloneCandidate=c=>({...c,mask:c.mask?{...c.mask,alpha:new Uint8Array(c.mask.alpha)}:c.mask});
const encodeMask=mask=>mask?{...mask,alphaBase64:mask.alpha?Buffer.from(mask.alpha).toString('base64'):undefined,alpha:undefined}:null;
const encode=candidates=>candidates.map(c=>({...c,mask:encodeMask(c.mask)}));

const modes={
  raw:null,
  grabcut:{mode:'grabcut',postprocess:{edgePolish:false,shapeRegularization:false,curveSmooth:false,apertures:false}},
  active:{mode:'active',postprocess:{edgePolish:false,shapeRegularization:false,curveSmooth:false,apertures:false}},
  morphgac:{mode:'morphgac',postprocess:{edgePolish:false,shapeRegularization:false,curveSmooth:false,apertures:false}},
  hybrid:{mode:'hybrid',postprocess:{edgePolish:true,shapeRegularization:false,curveSmooth:false,apertures:false}},
  traditional:{mode:'postprocess',postprocess:{edgePolish:true,shapeRegularization:true,curveSmooth:true,apertures:true}}
};
const results={};
for(const [name,config] of Object.entries(modes)){
  const candidates=base.map(cloneCandidate);
  if(!config){results[name]={elapsedMS:0,candidates:encode(candidates)};continue;}
  const started=performance.now();
  const refined=await processVision(cv,'material-boundary-refine',{
    pixels:sourcePixels,width,height,candidates,mode:config.mode,postprocess:config.postprocess,chromaEdges:true
  });
  results[name]={elapsedMS:performance.now()-started,candidates:encode(refined)};
}
fs.writeFileSync(outputPath,JSON.stringify({
  width,height,ratio,baseCount:base.length,timings,results
}));

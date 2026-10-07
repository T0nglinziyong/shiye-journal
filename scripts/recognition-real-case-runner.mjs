import fs from 'node:fs';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';
import {buildForegroundEvidence} from '../src/foreground-evidence.js';
import {fuseRecognitionCandidates} from '../src/recognition-fusion.js';
import {assessFastRecognition,fastCandidateForFusion} from '../src/recognition-quality.js';

// Offline harness for the private three-case acceptance set.
//
// Input is deliberately raw RGBA JSON rather than JPEG/PNG so this runner has
// no image-decoder dependency and can execute the exact browser OpenCV.js
// recognition modules in Node. Private photos stay outside Git.
//
// Usage:
//   node scripts/recognition-real-case-runner.mjs input.json output.json
//
// input.json:
//   {"width":900,"height":1273,"rgbaBase64":"...","analysisMaxDimension":1200}

const [, ,inputPath,outputPath]=process.argv;
if(!inputPath||!outputPath)throw Error('usage: recognition-real-case-runner.mjs input.json output.json');
const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const source=Buffer.from(input.rgbaBase64||'','base64');
if(source.length!==input.width*input.height*4)throw Error('RGBA byte length mismatch');

const cv=await cvModule;
const analysisMaxDimension=Number(input.analysisMaxDimension)||1200;
const ratio=Math.min(1,analysisMaxDimension/Math.max(input.width,input.height));
const width=Math.max(1,Math.round(input.width*ratio)),height=Math.max(1,Math.round(input.height*ratio));
const sourceMat=cv.matFromArray(input.height,input.width,cv.CV_8UC4,new Uint8ClampedArray(source));
const analysisMat=new cv.Mat();
if(width===input.width&&height===input.height)sourceMat.copyTo(analysisMat);
else cv.resize(sourceMat,analysisMat,new cv.Size(width,height),0,0,cv.INTER_AREA);
sourceMat.delete();
const sourcePixels=new Uint8ClampedArray(analysisMat.data);
analysisMat.delete();

const preprocess={illumination:true,denoise:true,localContrast:true,chromaEdges:true};
const postprocess={edgePolish:true,shapeRegularization:true,curveSmooth:true,apertures:true};
const balanced=await processVision(cv,'balance',{pixels:sourcePixels,width,height,options:preprocess});
const data=balanced.pixels;
const paperWidthMM=Number(input.paperWidthMM)||210,paperHeightMM=Number(input.paperHeightMM)||297,smallestMM=Number(input.smallestMM)||6;
const pxPerMM=((width/paperWidthMM)+(height/paperHeightMM))/2,cellSize=Math.max(24,Math.round(pxPerMM*13.5));
const evidence=buildForegroundEvidence(data,width,height,{sourcePixels,cellSize});

const fast=await processVision(cv,'materials-fast',{
  pixels:data,width,height,smallestMM,paperWidthMM,paperHeightMM,
  evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
  shadowLikelihood:evidence.shadowLikelihood,score:evidence.score,rectified:true,chromaEdges:true,
  postprocess:{shapeRegularization:false,curveSmooth:false,apertures:true}
});
const fastAssessment=assessFastRecognition(fast,{foregroundSeeds:evidence.foregroundSeeds,width,height});

let candidates;
if(fastAssessment.reliable){
  candidates=fast;
}else{
  const [instances,structural]=await Promise.all([
    processVision(cv,'instances',{
      mask:evidence.mask,evidence:evidence.evidence,foregroundSeeds:evidence.foregroundSeeds,
      shadowLikelihood:evidence.shadowLikelihood,pixels:sourcePixels,
      width,height,smallestMM,paperWidthMM,paperHeightMM,chromaEdges:true,postprocess
    }),
    processVision(cv,'enclosures',{
      pixels:data,evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
      shadowLikelihood:evidence.shadowLikelihood,score:evidence.score,
      width,height,smallestMM,paperWidthMM,paperHeightMM,chromaEdges:true,postprocess
    })
  ]);
  const reconstructed=instances.length?await processVision(cv,'boundary-reconstruction',{
    pixels:data,instances,evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
    shadowLikelihood:evidence.shadowLikelihood,score:evidence.score,
    width,height,smallestMM,paperWidthMM,paperHeightMM,chromaEdges:true,postprocess
  }):[];
  const trustedFast=fast.filter(fastCandidateForFusion);
  const fused=fuseRecognitionCandidates(instances,[...trustedFast,...structural,...reconstructed]);
  candidates=fused.length?await processVision(cv,'complete-boundaries',{
    pixels:sourcePixels,width,height,candidates:fused,smallestMM,paperWidthMM,paperHeightMM,
    evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
    shadowLikelihood:evidence.shadowLikelihood,chromaEdges:true,postprocess
  }):fused;
}

const noPost={edgePolish:false,shapeRegularization:false,curveSmooth:false,apertures:false};
const selected=[],indices=[];
for(let i=0;i<candidates.length;i++)if((candidates[i].recognitionConfidence??0)<.74){selected.push(candidates[i]);indices.push(i);}
let refined=[...candidates];
if(selected.length){
  const out=await processVision(cv,'material-boundary-refine',{
    pixels:sourcePixels,width,height,candidates:selected,mode:'auto',postprocess:noPost,chromaEdges:true
  });
  for(let i=0;i<indices.length;i++)refined[indices[i]]=out[i]||selected[i];
}
if(refined.length)refined=await processVision(cv,'material-boundary-refine',{
  pixels:sourcePixels,width,height,candidates:refined,mode:'postprocess',postprocess,chromaEdges:true
});

const serializable=refined.sort((a,b)=>a.y-b.y||a.x-b.x).map(candidate=>({
  ...candidate,
  mask:candidate.mask?{
    ...candidate.mask,
    alphaBase64:Buffer.from(candidate.mask.alpha).toString('base64'),
    alpha:undefined
  }:null
}));
fs.writeFileSync(outputPath,JSON.stringify({
  inputWidth:input.width,inputHeight:input.height,width,height,ratio,
  fastCount:fast.length,fastAssessment,finalCount:serializable.length,candidates:serializable
}));

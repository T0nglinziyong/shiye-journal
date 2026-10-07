import fs from 'node:fs';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';
import {buildForegroundEvidence} from '../src/foreground-evidence.js';

const [, ,inputPath,outputPath]=process.argv;
if(!inputPath||!outputPath)throw Error('usage: instance-first-real-case-runner.mjs input.json output.json');
const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const source=Buffer.from(input.rgbaBase64||'','base64');
if(source.length!==input.width*input.height*4)throw Error('RGBA byte length mismatch');

const cv=await cvModule,maxDim=Number(input.analysisMaxDimension)||900;
const ratio=Math.min(1,maxDim/Math.max(input.width,input.height));
const width=Math.max(1,Math.round(input.width*ratio)),height=Math.max(1,Math.round(input.height*ratio));
const started=performance.now(),src=cv.matFromArray(input.height,input.width,cv.CV_8UC4,new Uint8ClampedArray(source)),scaled=new cv.Mat();
if(width===input.width&&height===input.height)src.copyTo(scaled);
else cv.resize(src,scaled,new cv.Size(width,height),0,0,cv.INTER_AREA);
src.delete();
const sourcePixels=new Uint8ClampedArray(scaled.data);scaled.delete();
const tResize=performance.now();

const preprocess={illumination:true,denoise:true,localContrast:true,chromaEdges:true};
const balanced=await processVision(cv,'balance',{pixels:sourcePixels,width,height,options:preprocess});
const tBalance=performance.now(),paperWidthMM=Number(input.paperWidthMM)||210,paperHeightMM=Number(input.paperHeightMM)||297,smallestMM=Number(input.smallestMM)||6,
  pxPerMM=((width/paperWidthMM)+(height/paperHeightMM))/2,cellSize=Math.max(24,Math.round(pxPerMM*13.5)),
  evidence=buildForegroundEvidence(balanced.pixels,width,height,{sourcePixels,cellSize}),tEvidence=performance.now();
const instances=await processVision(cv,'instances-simple',{
  mask:evidence.mask,evidence:evidence.evidence,foregroundSeeds:evidence.foregroundSeeds,
  width,height,smallestMM,paperWidthMM,paperHeightMM
});
const tInstances=performance.now();
const candidates=instances.map(candidate=>({
  ...candidate,
  mask:candidate.mask?{...candidate.mask,alphaBase64:Buffer.from(candidate.mask.alpha).toString('base64'),alpha:undefined}:null
}));
fs.writeFileSync(outputPath,JSON.stringify({
  width,height,ratio,count:candidates.length,candidates,
  timingMS:{resize:tResize-started,balance:tBalance-tResize,evidence:tEvidence-tBalance,instances:tInstances-tEvidence,total:tInstances-started}
}));

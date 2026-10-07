import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';
import {buildForegroundEvidence} from '../src/foreground-evidence.js';

const [, ,inputPath,outputPath]=process.argv;
if(!inputPath||!outputPath)throw Error('usage: segmentation-real-case-runner.mjs input.json output.json');
const input=JSON.parse(fs.readFileSync(inputPath,'utf8')),
  source=Buffer.from(input.rgbaBase64||'','base64');
if(source.length!==input.width*input.height*4)throw Error('RGBA byte length mismatch');

const cv=await cvModule,totalStarted=performance.now(),maxDim=Number(input.analysisMaxDimension)||900,
  ratio=Math.min(1,maxDim/Math.max(input.width,input.height)),
  width=Math.max(1,Math.round(input.width*ratio)),height=Math.max(1,Math.round(input.height*ratio)),
  src=cv.matFromArray(input.height,input.width,cv.CV_8UC4,new Uint8ClampedArray(source)),dst=new cv.Mat();
if(width===input.width&&height===input.height)src.copyTo(dst);
else cv.resize(src,dst,new cv.Size(width,height),0,0,cv.INTER_AREA);
const pixels=new Uint8ClampedArray(dst.data);src.delete();dst.delete();
const afterResize=performance.now(),paperWidthMM=Number(input.paperWidthMM)||210,
  paperHeightMM=Number(input.paperHeightMM)||297,smallestMM=Number(input.smallestMM)||6,
  pxPerMM=((width/paperWidthMM)+(height/paperHeightMM))/2,
  cellSize=Math.max(24,Math.round(pxPerMM*13.5)),
  evidence=buildForegroundEvidence(pixels,width,height,{sourcePixels:pixels,cellSize}),
  afterEvidence=performance.now(),
  boxes=await processVision(cv,'boxes-simple',{
    mask:evidence.mask,evidence:evidence.evidence,foregroundSeeds:evidence.foregroundSeeds,
    width,height,smallestMM,paperWidthMM,paperHeightMM
  }),
  afterBoxes=performance.now(),
  materials=await processVision(cv,'segment-boxes-classical',{
    pixels,width,height,boxes,paperWidthMM,paperHeightMM
  }),
  afterSegmentation=performance.now();

const encodeMask=mask=>mask?{
  ...mask,
  alphaBase64:mask.alpha?Buffer.from(mask.alpha).toString('base64'):undefined,
  alpha:undefined
}:null;
fs.writeFileSync(outputPath,JSON.stringify({
  width,height,ratio,boxCount:boxes.length,finalCount:materials.length,
  timingMS:{
    resize:afterResize-totalStarted,
    evidence:afterEvidence-afterResize,
    boxes:afterBoxes-afterEvidence,
    segmentation:afterSegmentation-afterBoxes,
    total:afterSegmentation-totalStarted
  },
  boxes,
  materials:materials.map(item=>({...item,mask:encodeMask(item.mask)}))
}));

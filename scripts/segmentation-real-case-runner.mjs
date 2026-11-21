import fs from 'node:fs';
import cvModule from '@techstark/opencv-js';
import {processVision} from '../src/opencv-worker.js';
import {buildForegroundEvidence} from '../src/foreground-evidence.js';

const [,,inputPath,outputPath]=process.argv;
if(!inputPath||!outputPath)throw Error('usage: segmentation-real-case-runner.mjs input.json output.json');
const input=JSON.parse(fs.readFileSync(inputPath,'utf8')),source=Buffer.from(input.rgbaBase64||'','base64');
if(source.length!==input.width*input.height*4)throw Error('RGBA byte length mismatch');

const cv=await cvModule,totalStarted=performance.now(),maxDim=Number(input.analysisMaxDimension)||900,
  ratio=Math.min(1,maxDim/Math.max(input.width,input.height)),
  width=Math.max(1,Math.round(input.width*ratio)),height=Math.max(1,Math.round(input.height*ratio)),
  src=cv.matFromArray(input.height,input.width,cv.CV_8UC4,new Uint8ClampedArray(source)),dst=new cv.Mat();

const t0=performance.now();
if(width===input.width&&height===input.height)src.copyTo(dst);
else cv.resize(src,dst,new cv.Size(width,height),0,0,cv.INTER_AREA);
const pixels=new Uint8ClampedArray(dst.data);src.delete();dst.delete();
const t1=performance.now(),paperWidthMM=Number(input.paperWidthMM)||210,paperHeightMM=Number(input.paperHeightMM)||297,
  smallestMM=Number(input.smallestMM)||6,pxPerMM=((width/paperWidthMM)+(height/paperHeightMM))/2,
  cellSize=Math.max(24,Math.round(pxPerMM*13.5)),
  evidence=buildForegroundEvidence(pixels,width,height,{sourcePixels:pixels,cellSize}),t2=performance.now(),
  boxes=await processVision(cv,'boxes-simple',{
    mask:evidence.mask,evidence:evidence.evidence,foregroundSeeds:evidence.foregroundSeeds,
    width,height,smallestMM,paperWidthMM,paperHeightMM
  }),t3=performance.now(),
  segmented=await processVision(cv,'segment-boxes-classical',{
    pixels,width,height,boxes,foregroundMask:evidence.mask,evidence:evidence.evidence,
    foregroundSeeds:evidence.foregroundSeeds,shadowLikelihood:evidence.shadowLikelihood,
    paperWidthMM,paperHeightMM
  }),t4=performance.now(),
  shaped=await processVision(cv,'material-boundary-refine',{
    pixels,width,height,candidates:segmented,mode:'postprocess',
    postprocess:{edgePolish:false,shapeRegularization:true,curveSmooth:false,apertures:false},
    chromaEdges:true
  }),t5=performance.now(),
  candidates=await processVision(cv,'restore-repeated-apertures',{
    pixels,width,height,candidates:shaped,paperWidthMM,paperHeightMM
  }),t6=performance.now();

const encodeMask=mask=>mask?{...mask,alphaBase64:mask.alpha?Buffer.from(mask.alpha).toString('base64'):undefined,alpha:undefined}:null;
fs.writeFileSync(outputPath,JSON.stringify({
  inputWidth:input.width,inputHeight:input.height,width,height,ratio,
  boxCount:boxes.length,finalCount:candidates.length,
  timingMS:{resize:t1-t0,evidence:t2-t1,boxes:t3-t2,segmentation:t4-t3,shapeRegularization:t5-t4,repeatedApertures:t6-t5,total:t6-totalStarted},
  boxes,
  candidates:candidates.map(c=>({...c,mask:encodeMask(c.mask)}))
}));

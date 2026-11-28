// Run the real pinned @techstark/opencv-js/WASM pipeline against local JPEGs.
// Example:
//   node scripts/benchmark-a4-optimized.mjs --repeat 5 --reference ./refs.json photo1.jpg photo2.jpg
// refs.json is an optional map: {"photo1.jpg":[{"x":...,"y":...},...]}.
// Does not read/write the user's browser database or modify any photos.
import {readFile} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import cvModule from '@techstark/opencv-js';
import {decode} from '../src/vendor/jpeg-decoder.js';
import {processVision} from '../src/opencv-worker.js';
import {paperPolygonIoU} from '../src/paper-quad-optimized.js';

const argv=process.argv.slice(2);
let repeats=5,referencePath=null;
const paths=[];
for(let i=0;i<argv.length;i++){
  if(argv[i]==='--repeat'){repeats=Number(argv[++i]);continue;}
  if(argv[i]==='--reference'){referencePath=argv[++i];continue;}
  paths.push(argv[i]);
}
if(!paths.length||!Number.isInteger(repeats)||repeats<1||repeats>50)
  throw Error('Usage: node scripts/benchmark-a4-optimized.mjs [--repeat 5] [--reference corners.json] image1.jpg ...');
const references=referencePath?JSON.parse(await readFile(referencePath,'utf8')):{};
const cv=cvModule instanceof Promise?await cvModule:cvModule?.Mat?cvModule:
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('OpenCV.js WASM init timeout')),60000);
    cvModule.onRuntimeInitialized=()=>{clearTimeout(timeout);resolve(cvModule);};
  });
if(!cv?.Mat)throw Error('OpenCV.js did not initialize');
const performanceMedian=values=>{
  const xs=values.slice().sort((a,b)=>a-b),i=xs.length>>1;
  return +(xs.length%2?xs[i]:(xs[i-1]+xs[i])/2).toFixed(2);
};
function isDisplayP3(bytes){
  for(let p=2;p+4<bytes.length&&bytes[p]===255;){
    const marker=bytes[p+1];
    if(marker===0xda||marker===0xd9)break;
    const size=(bytes[p+2]<<8)|bytes[p+3];
    if(size<2||p+2+size>bytes.length)break;
    if(marker===0xe2){
      const segment=bytes.subarray(p+4,p+2+size),label='Display P3';
      for(let i=14;i+label.length<=segment.length;i++){
        if(label.split('').every((c,j)=>segment[i+j]===c.charCodeAt(0)))return true;
        if(i+label.length*2<=segment.length&&label.split('').every((c,j)=>segment[i+j*2]===0&&segment[i+j*2+1]===c.charCodeAt(0)))return true;
      }
    }
    p+=size+2;
  }
  return false;
}
function p3ToSrgb(pixels){
  const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
  const encode=v=>Math.round(255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055));
  for(let i=0;i<pixels.length;i+=4){
    const r=linear(pixels[i]),g=linear(pixels[i+1]),b=linear(pixels[i+2]);
    pixels[i]=encode(1.224940176*r-.224940176*g);
    pixels[i+1]=encode(-.042056955*r+1.042056955*g);
    pixels[i+2]=encode(-.019637554*r-.078636046*g+1.098273600*b);
  }
}
const records=[];
await processVision(cv,'warmup',{});
for(const filename of paths){
  const raw=new Uint8Array(await readFile(resolve(filename)));
  const loadStart=performance.now();
  const image=decode(raw,{useTArray:true,maxResolutionInMP:60,maxMemoryUsageInMB:512});
  if(isDisplayP3(raw))p3ToSrgb(image.data);
  const decodeMS=+(performance.now()-loadStart).toFixed(2);
  // This does not handle arbitrary EXIF orientations. All six current test
  // inputs were verified as orientation 1/no orientation.
  const scale=Math.min(1,800/Math.max(image.width,image.height));
  const w=Math.max(1,Math.round(scale*image.width)),
    h=Math.max(1,Math.round(scale*image.height));
  const src=cv.matFromArray(image.height,image.width,cv.CV_8UC4,image.data);
  const resized=new cv.Mat();
  let pixels;
  const t=performance.now();
  try{
    if(w!==image.width||h!==image.height)
      cv.resize(src,resized,new cv.Size(w,h),0,0,cv.INTER_AREA);
    else src.copyTo(resized);
    pixels=new Uint8ClampedArray(resized.data);
  }finally{resized.delete();src.delete();}
  const resizeMS=+(performance.now()-t).toFixed(2);
  const parameters={pixels,width:w,height:h,paperRatio:210/297};
  const times=[],results=[];
  // The first call populates WASM caches; do not include that in steady-state.
  await processVision(cv,'quad',parameters);
  for(let rep=0;rep<repeats;rep++){
    const start=performance.now();
    const corners=await processVision(cv,'quad',parameters);
    times.push(performance.now()-start);results.push(corners);
  }
  const corners=results[results.length-1];
  const name=basename(filename),reference=references[name];
  const iou=corners&&reference?paperPolygonIoU(corners,reference):null;
  const stable=JSON.stringify(results[0])===JSON.stringify(results.at(-1));
  records.push({name,original:[image.width,image.height],analysis:[w,h],
    detected:!!corners,corners,IoU:iou,decodeMS,resizeMS,medianQuadMS:performanceMedian(times),
    minQuadMS:+Math.min(...times).toFixed(2),maxQuadMS:+Math.max(...times).toFixed(2),
    stableAcrossRepeatedCalls:stable,p3Profile:isDisplayP3(raw)});
  console.log(JSON.stringify(records.at(-1)));
}
console.log(JSON.stringify({summary:{count:records.length,detected:records.filter(r=>r.detected).length,
  passed95:records.filter(r=>r.IoU!=null&&r.IoU>=.95).length,
  medianQuadMS:performanceMedian(records.map(r=>r.medianQuadMS))},records},null,2));

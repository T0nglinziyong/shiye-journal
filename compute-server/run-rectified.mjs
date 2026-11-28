// The PWA has already rectified the entire A4 page. Preserve its orientation.
import {createCanvas,loadImage} from 'canvas';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {processVision} from '../src/opencv-worker.js';

const args=process.argv.slice(2);
const value=(name,fallback)=>{const at=args.indexOf(name);return at>=0?args[at+1]:fallback;};
const source=args[0],output=path.resolve(value('--output',''));
const model=value('--model-size','small'),granularity=value('--granularity','balanced');
const points=Number(value('--points-per-side','24')),crops=Number(value('--crop-n-layers','1'));
const boxAt=args.indexOf('--box');
const box=boxAt>=0?args.slice(boxAt+1,boxAt+5).map(Number):null;
const bool=name=>{const result=value(name,'false');if(!['true','false'].includes(result))throw Error('Invalid preprocessing flag');return result==='true';};
const preprocessing={illumination:bool('--illumination'),denoise:bool('--denoise'),
  localContrast:bool('--local-contrast')};
if(!source||!args.includes('--output')||!['tiny','small','large'].includes(model)||
  !['coarse','balanced','fine'].includes(granularity)||![8,12,16,24,32].includes(points)||![0,1,2].includes(crops)||
  (box&&(!box.every(Number.isInteger)||box.length!==4||box[0]<0||box[1]<0||box[2]<=box[0]||box[3]<=box[1])))
  throw Error('Invalid rectified pipeline arguments');
const samRoot=path.resolve(value('--sam-root',path.resolve('../sam2.1-local')));
const python=path.join(samRoot,'.venv/bin/python');
await mkdir(output,{recursive:true});
const bytes=await readFile(source),image=await loadImage(bytes);
if(image.width<600||image.height<600||image.width*image.height>20_000_000)
  throw Error('Rectified A4 page dimensions are out of bounds');
const ratio=image.width/image.height;
if(Math.min(Math.abs(ratio-297/210),Math.abs(ratio-210/297))>.05)
  throw Error('Input page is not a rectified A4 page');
if(box&&(box[2]>image.width||box[3]>image.height))throw Error('SAM box outside rectified page');
const correctedPath=path.join(output,'corrected.png');
await writeFile(correctedPath,bytes);
const modelInput=path.join(output,'model-input.png');
if(Object.values(preprocessing).some(Boolean)){
  const {default:cvModule}=await import('@techstark/opencv-js/dist/opencv.js');
  const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
  ctx.drawImage(image,0,0);
  const original=ctx.getImageData(0,0,image.width,image.height);
  const cv=await cvModule;
  const balanced=await processVision(cv,'balance',{pixels:new Uint8ClampedArray(original.data),
    width:image.width,height:image.height,options:preprocessing});
  const modelImage=ctx.createImageData(image.width,image.height);
  modelImage.data.set(balanced.pixels);ctx.putImageData(modelImage,0,0);
  await writeFile(modelInput,canvas.toBuffer('image/png'));
}else await writeFile(modelInput,bytes);
const run=(script,params)=>{
  const child=spawnSync(python,[path.join(samRoot,script),...params],{
    cwd:samRoot,encoding:'utf8',timeout:12*60_000,maxBuffer:1024*1024});
  if(child.status!==0)throw Error(`${script} failed (${child.status??'timeout'})`);
};
const sam=path.join(output,'sam'),materials=path.join(output,'materials');
let objects;
if(box){
  run('segment.py',[modelInput,'--source-image',correctedPath,'--mode','prompt',
    '--model-size',model,'--box',...box.map(String),'--output',sam]);
  const report=JSON.parse(await readFile(path.join(sam,'report.json'),'utf8'));
  await mkdir(materials,{recursive:true});
  objects=[];
  for(const [index,item] of report.objects.entries()){
    const file=`material-${String(index+1).padStart(3,'0')}.png`;
    await copyFile(path.join(sam,item.file),path.join(materials,file));
    objects.push({file,bbox_xyxy:item.bbox_xyxy,area:item.area});
  }
}else{
  run('segment.py',[modelInput,'--source-image',correctedPath,'--mode','auto',
    '--model-size',model,'--granularity','fine','--points-per-side',String(points),
    '--pred-iou-thresh','0.70','--stability-score-thresh','0.90',
    '--crop-n-layers',String(crops),'--crop-n-points-downscale-factor','1',
    '--max-masks','200','--output',sam]);
  run('postprocess_results.py',[sam,'--granularity',granularity,'--output',materials]);
  const report=JSON.parse(await readFile(path.join(materials,'report.json'),'utf8'));
  objects=report.objects.map(({file,bbox_xyxy,area})=>({file,bbox_xyxy,area}));
}
if(objects.length>250||objects.some(o=>!/^material-\d{3}\.png$/.test(o.file)))
  throw Error('Invalid model material manifest');
await writeFile(path.join(materials,'result.json'),JSON.stringify({version:1,width:image.width,
  height:image.height,model:'sam2-'+model,objects}));
console.log(JSON.stringify({objects:objects.length,width:image.width,height:image.height}));

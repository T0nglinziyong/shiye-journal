// Compare one calibrated spread at different type scales without changing its layout.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {loadOfflineCanvas,renderOfflinePNG} from '../src/offline-node-preview.mjs';
import {compileSixSpreadTemplate,describeSixSpreadTemplate} from '../creative-agent/library/six-spread-templates.js';

const [calibrationArg,outputArg]=process.argv.slice(2);
if(!calibrationArg||!outputArg)throw Error('用法：node scripts/render-spread-font-comparison.mjs <校准素材目录> <输出目录>');
const calibrationDir=resolve(calibrationArg),output=resolve(outputArg),templateId='S03-棕蓝爱心';
const template=describeSixSpreadTemplate(templateId),canvas=await loadOfflineCanvas();
await mkdir(output,{recursive:true});

async function visibleBounds(file){
 const image=await canvas.loadImage(file),surface=canvas.createCanvas(image.width,image.height),ctx=surface.getContext('2d');
 ctx.drawImage(image,0,0);
 const {data}=ctx.getImageData(0,0,image.width,image.height);
 let left=image.width,top=image.height,right=0,bottom=0;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(data[(y*image.width+x)*4+3]>=32){
  left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
 }
 return [left/image.width,top/image.height,right/image.width,bottom/image.height];
}

const slots=[
 ['L-heart-photo','S03-黑白爱心.png','黑白爱心照片'],
 ['R-cake-illustration','S03-复古画卡.png','甜点复古插画卡']
];
const assets=await Promise.all(slots.map(async ([slot,file,title],index)=>{
 const box=template.nodes.find(row=>row[0]===slot)[3],bounds=await visibleBounds(join(calibrationDir,file));
 return {id:`font-comparison-${index}`,alias:`cal-${slot}`,slot,title,kind:'sticker',visualRoles:['photo','printed-card'],usage:'calibration-only',
  physicalWidthMM:Math.round((box[2]-box[0])*.95/(bounds[2]-bounds[0])*10)/10,
  physicalHeightMM:Math.round((box[3]-box[1])*1.71/(bounds[3]-bounds[1])*10)/10,
  visualBoundsRatio:bounds,local:join(calibrationDir,file),supply:{quantity:1}};
}));
const plan={templateId,used:assets.map(a=>a.alias),compatible:true,missingCritical:[],assignments:assets.map(a=>{
 const box=template.nodes.find(n=>n[0]===a.slot)[3],b=a.visualBoundsRatio;
 const center=[(box[0]+box[2])*.475,(box[1]+box[3])*.855];
 return {slot:a.slot,asset:a.alias,at:[center[0]-(b[0]+b[2]-1)*a.physicalWidthMM/2,center[1]-(b[1]+b[3]-1)*a.physicalHeightMM/2],sourceMm:[a.physicalWidthMM,a.physicalHeightMM]};
})};
const base=compileSixSpreadTemplate({templateId,assets,plan,calibrationMode:true});
const buffers=Object.fromEntries(await Promise.all(assets.map(async a=>[a.alias,await readFile(a.local)])));
const variants=[
 {name:'小字号',bodyPt:9,datePt:22},
 {name:'当前字号',bodyPt:10.5,datePt:26},
 {name:'大字号',bodyPt:12,datePt:26}
];
for(const variant of variants){
 const operations=structuredClone(base.operations);
 for(const op of operations)if(op.op==='text.add'){
  op.style.fontSizePt=op.id==='L-date-text'?variant.datePt:variant.bodyPt;
 }
 const page=draft({mode:'spread',ratio:'personal'});
 let document=await createCreationDocument({draft:page,assets,aliases:Object.fromEntries(assets.map(a=>[a.alias,a.id])),title:`${templateId} ${variant.name}`,prompt:'字号对照，仅用于模板校准'});
 for(let i=0;i<operations.length;i+=10)document=applyCreationTransaction(document,{protocolVersion:2,transactionId:`font-${String(variant.bodyPt).replace('.','_')}-${i}`,baseSceneRevision:creationSceneRevision(document),operations:operations.slice(i,i+10)},assets).document;
 const {png}=await renderOfflinePNG(document.page,document.source,buffers,canvas);
 await writeFile(join(output,`${variant.name}-正文${variant.bodyPt}pt-日期${variant.datePt}pt.png`),png);
}
await writeFile(join(output,'字号方案.json'),JSON.stringify({templateId,variants},null,2));

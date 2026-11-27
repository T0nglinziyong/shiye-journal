// Offline geometry check only. The source-like images in calibrationDir are
// never loaded by template-draft.js or the real-material rendering path.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {measureSceneText} from '../src/scene-text-layout.js';
import {loadOfflineCanvas,renderOfflinePNG} from '../src/offline-node-preview.mjs';
import {compileSixSpreadTemplate,describeSixSpreadTemplate} from '../creative-agent/library/six-spread-templates.js';

const [calibrationArg,outputArg]=process.argv.slice(2);
if(!calibrationArg||!outputArg)throw Error('用法：node scripts/render-six-spread-calibration.mjs <私有校准素材目录> <输出目录>');
const calibrationDir=resolve(calibrationArg),output=resolve(outputArg);
const cases=[
 ['S01-苹果绿白','L-apple-photo','S01-青苹果.png','青苹果照片'],
 ['S01-苹果绿白','R-black-photo','S01-黑照片.png','黑白照片'],
 ['S01-苹果绿白','R-fruit-basket','S01-苹果篮.png','水果苹果果篮'],
 ['S02-青黄面包','L-bread-photo','S02-面包组.png','面包照片'],
 ['S02-青黄面包','R-fruit-basket','S01-苹果篮.png','水果苹果果篮'],
 ['S03-棕蓝爱心','L-heart-photo','S03-黑白爱心.png','黑白爱心照片'],
 ['S03-棕蓝爱心','R-cake-illustration','S03-复古画卡.png','甜点复古插画卡'],
 ['S04-粉黑百合','L-flower-photo','S04-灰花照片.png','灰色花朵照片'],
 ['S04-粉黑百合','R-lily','S04-百合.png','粉色百合花朵剪片'],
 ['S05-灰黄甜点','L-vase-card','S05-花瓶卡.png','花瓶插花卡'],
 ['S05-灰黄甜点','L-elephant-card','S05-象卡.png','小象动物插画卡'],
 ['S05-灰黄甜点','R-dessert-photo','S05-蛋糕照片.png','甜点蛋糕照片'],
 ['S06-白粉果实','L-fruit-photo','S06-水果照片.png','苹果水果照片'],
 ['S06-白粉果实','L-flower','S04-百合.png','粉色百合花朵剪片'],
 ['S06-白粉果实','R-fig-card','S06-无花果卡.png','无花果照片卡'],
 ['S06-白粉果实','R-flower','S04-百合.png','粉色百合花朵剪片']
];
await mkdir(output,{recursive:true});
const canvas=await loadOfflineCanvas();
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
for(const templateId of [...new Set(cases.map(row=>row[0]))]){
 const template=describeSixSpreadTemplate(templateId),assets=await Promise.all(cases.filter(row=>row[0]===templateId).map(async ([_,slot,file,title],index)=>{
  const node=template.nodes.find(row=>row[0]===slot),box=node[3];
  const bounds=await visibleBounds(join(calibrationDir,file));
  return {id:`calibration-${templateId.slice(0,3)}-${index}`,alias:`cal-${slot}`,slot,title,
   kind:'sticker',visualRoles:['photo','printed-card','figure'],usage:'calibration-only',
   // These offline cutouts have transparent padding and no measured real-world
   // size. Infer a calibration size from their visible area, not the PNG frame.
   physicalWidthMM:Math.round((box[2]-box[0])*.95/(bounds[2]-bounds[0])*10)/10,
   physicalHeightMM:Math.round((box[3]-box[1])*1.71/(bounds[3]-bounds[1])*10)/10,
   visualBoundsRatio:bounds,
   local:join(calibrationDir,file),supply:{quantity:1}};
 }));
 const plan={templateId,used:assets.map(a=>a.alias),compatible:true,missingCritical:[],assignments:assets.map(a=>{
  const box=template.nodes.find(n=>n[0]===a.slot)[3],bounds=a.visualBoundsRatio;
  const center=[(box[0]+box[2])*.475,(box[1]+box[3])*.855];
  return {slot:a.slot,asset:a.alias,at:[center[0]-(bounds[0]+bounds[2]-1)*a.physicalWidthMM/2,center[1]-(bounds[1]+bounds[3]-1)*a.physicalHeightMM/2],sourceMm:[a.physicalWidthMM,a.physicalHeightMM]};
 })};
 const compiled=compileSixSpreadTemplate({templateId,assets,plan,calibrationMode:true});
 const page=draft({mode:'spread',ratio:'personal'}),selected=assets.filter(a=>plan.used.includes(a.alias));
 let document=await createCreationDocument({draft:page,assets:selected,aliases:Object.fromEntries(selected.map(a=>[a.alias,a.id])),title:`${templateId} 校准`,prompt:'仅检查模板几何，禁止用于用户作品'});
 for(let i=0;i<compiled.operations.length;i+=10)document=applyCreationTransaction(document,{protocolVersion:2,transactionId:`calibration-${templateId.slice(0,3)}-${i}`,baseSceneRevision:creationSceneRevision(document),operations:compiled.operations.slice(i,i+10)},selected).document;
 const layers=new Map(document.page.layers.map(layer=>[layer.agentKey||layer.creativePieceID||layer.id,layer]));
 const stack=template.occlusion.filter(([front,back])=>layers.has(front)&&layers.has(back)).map(([front,back])=>({front,back,frontZ:layers.get(front).zIndex,backZ:layers.get(back).zIndex,valid:layers.get(front).zIndex>layers.get(back).zIndex}));
 for(const row of stack)if(!row.valid)throw Error(`${templateId} 图层次序错误：${row.front} 应位于 ${row.back} 上方`);
 const numerals=compiled.operations.filter(op=>op.op==='text.fit').map(op=>{const layer=layers.get(op.target),layout=measureSceneText(layer);return {id:op.target,content:layer.content,fontSizePt:Math.round(layer.fontSize/document.page.canvas.height*document.page.physicalPageHeightMM*72/25.4*10)/10,lines:layout.lines.length};});
 for(const row of numerals)if(row.lines!==1)throw Error(`${templateId} 数字 ${row.id} 换行了`);
 const buffers=Object.fromEntries(await Promise.all(selected.map(async a=>[a.alias,await readFile(a.local)])));
 const {png}=await renderOfflinePNG(document.page,document.source,buffers,canvas);
 await writeFile(join(output,`${templateId}-局部校准.png`),png);
 await writeFile(join(output,`${templateId}-可编辑场景.json`),JSON.stringify(document.page,null,2));
 await writeFile(join(output,`${templateId}-测量复核.json`),JSON.stringify({sourceFrame:template.source,stack,numerals},null,2));
 await writeFile(join(output,`${templateId}-局部校准.json`),JSON.stringify({calibrationOnly:true,used:plan.used,missing:plan.missingCritical,occlusion:template.occlusion},null,2));
 console.log(templateId,`校准素材 ${plan.used.length} 件，尚未校准关键槽 ${plan.missingCritical.length} 个`);
}

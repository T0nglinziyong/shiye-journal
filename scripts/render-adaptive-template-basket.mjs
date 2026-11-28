import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {loadOfflineCanvas,renderOfflinePNG} from '../src/offline-node-preview.mjs';
import {describeTemplateObjects,matchMaterialsToTemplates,compileMatchedTemplate} from '../creative-agent/library/adaptive-template-matcher.js';

const [manifestFile,profilesFile,outputArg]=process.argv.slice(2);
if(!manifestFile||!profilesFile)throw new Error('用法：node render-adaptive-template-basket.mjs manifest.json profiles.json [output]');
const output=resolve(outputArg||'/tmp/shiye-adaptive-template'),manifest=JSON.parse(await readFile(manifestFile,'utf8')),
 profiles=JSON.parse(await readFile(profilesFile,'utf8')),
 rows=profiles.map(profile=>({...manifest.find(row=>row.alias===profile.alias),...profile,supply:{quantity:1}}));
if(rows.some(row=>!row.id||!row.local))throw new Error('素材画像与本地原图清单不一致');
await mkdir(output,{recursive:true});
const ranked=matchMaterialsToTemplates(profiles);
await writeFile(join(output,'五个模板匹配排名.json'),JSON.stringify(ranked.map(({template,...rest})=>rest),null,2));
for(const {templateId} of ranked)await writeFile(join(output,`${templateId}-对象槽位记录.json`),JSON.stringify(describeTemplateObjects(templateId),null,2));
const canvas=await loadOfflineCanvas();
for(const plan of ranked.slice(0,Number(process.argv[5]||3))){
 const result=compileMatchedTemplate(plan,rows),[width,height]=result.report.pageMm,page=draft({ratio:'a5'});
 page.physicalPageHeightMM=height;page.canvas.width=page.canvas.height*width/height;
 const selected=rows.filter(row=>plan.used.includes(row.alias));
 let document=await createCreationDocument({draft:page,assets:selected,aliases:Object.fromEntries(selected.map(row=>[row.alias,row.id])),title:`${plan.templateId} 自适应模板初稿`,prompt:'20 件真实素材，保持原始毫米尺寸'});
 for(let i=0;i<result.operations.length;i+=12){
  try{document=applyCreationTransaction(document,{protocolVersion:2,transactionId:`${plan.templateId}-adaptive-${i}`,baseSceneRevision:creationSceneRevision(document),operations:result.operations.slice(i,i+12)},selected).document;}
  catch(error){throw new Error(`${plan.templateId} 操作 ${i+1}-${i+12} 失败：${error.message}`,{cause:error});}
 }
 const materialLayers=document.page.layers.filter(layer=>layer.type==='material');
 const mmPerPixel=height/document.page.canvas.height;
 const actual=materialLayers.map(layer=>{
  const source=selected.find(row=>row.id===layer.assetID),choice=plan.assignments.find(row=>row.slot===layer.creativePieceID);
  const physicalMm=[layer.width*mmPerPixel,layer.height*mmPerPixel];
  const unchanged=choice?.method==='complete'&&layer.creativePieceID!=='title-tape'&&layer.creativePieceID!=='bottom-tape';
  if(unchanged&&source&&(Math.abs(physicalMm[0]-source.physicalWidthMM)>.15||Math.abs(physicalMm[1]-source.physicalHeightMM)>.15))throw new Error(`${plan.templateId} 素材 ${layer.creativePieceID} 被缩放`);
  const piece=result.operations.flatMap(op=>op.op==='material.split'?op.pieces||[]:[]).find(p=>p.id===layer.creativePieceID);
  if(choice?.method==='crop'&&piece&&(Math.abs(physicalMm[0]-piece.region.box[2])>.15||Math.abs(physicalMm[1]-piece.region.box[3])>.15))throw new Error(`${plan.templateId} 裁切片 ${layer.creativePieceID} 的毫米尺寸不符`);
  return {slot:layer.creativePieceID,asset:source?.alias,sourceMm:source?[source.physicalWidthMM,source.physicalHeightMM]:null,renderedMm:physicalMm.map(n=>Math.round(n*100)/100),operation:choice?.method||'offcut',physicalSizeVerified:unchanged||Boolean(choice?.method==='crop'&&piece),parked:layer.isParked||false};
 });
 const buffers=Object.fromEntries(await Promise.all(selected.map(async row=>[row.alias,await readFile(row.local)])));
 const {png,report}=await renderOfflinePNG(document.page,document.source,buffers,canvas);
 await writeFile(join(output,`${plan.templateId}-真实素材初稿.png`),png);
 await writeFile(join(output,`${plan.templateId}-可编辑场景.json`),JSON.stringify(document,null,2));
 await writeFile(join(output,`${plan.templateId}-匹配与尺寸核验.json`),JSON.stringify({score:plan.score,assignments:plan.assignments,used:result.report.used,actual,render:report},null,2));
 console.log(plan.templateId,JSON.stringify({score:plan.score,used:result.report.used,materialLayers:materialLayers.length,bytes:png.length}));
}

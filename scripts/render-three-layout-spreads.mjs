import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {loadOfflineCanvas,renderOfflinePNG} from '../src/offline-node-preview.mjs';
import {listThreeLayoutSpreads,describeThreeLayoutSpread,matchThreeLayoutSpread,compileThreeLayoutSpread,LAYOUT_LEAF_MM} from '../creative-agent/library/three-layout-template-matcher.js';
import {sourceMeasurements} from '../creative-agent/library/three-layout-source-measurements.js';

const [manifestFile,profilesFile,outputArg]=process.argv.slice(2);
if(!manifestFile||!profilesFile)throw Error('用法：node scripts/render-three-layout-spreads.mjs manifest.json profiles.json [output]');
const output=resolve(outputArg||'/tmp/shiye-three-layout'),manifest=JSON.parse(await readFile(manifestFile,'utf8')),
 profiles=JSON.parse(await readFile(profilesFile,'utf8')),
 assets=manifest.map(row=>({...row,...profiles.find(profile=>profile.alias===row.alias),visualRoles:profiles.find(profile=>profile.alias===row.alias)?.visualRoles||(row.kind==='photo'?['photo']:row.kind==='sticker'?['sticker','accent']:[]),supply:{quantity:1}}));
if(assets.some(asset=>!asset.id||!asset.local))throw Error('素材画像与本地真实素材清单不一致');
await mkdir(output,{recursive:true});
await writeFile(join(output,'三模板槽位配置.json'),JSON.stringify(listThreeLayoutSpreads().map(describeThreeLayoutSpread),null,2));
const canvas=await loadOfflineCanvas();
for(const [templateIndex,templateId] of listThreeLayoutSpreads().entries()){
 const plan=matchThreeLayoutSpread(templateId,assets),compiled=compileThreeLayoutSpread({templateId,assets,plan});
 const page=draft({mode:'spread',ratio:'b6'}),selected=assets.filter(a=>plan.used.includes(a.alias));
 if(page.physicalPageHeightMM!==LAYOUT_LEAF_MM[1])throw Error('双页尺寸不符');
 let document=await createCreationDocument({draft:page,assets:selected,aliases:Object.fromEntries(selected.map(a=>[a.alias,a.id])),title:`${templateId} 初稿`,prompt:'按小红书首页成品与结构图匹配真实素材；保留素材原始毫米尺寸'});
 for(let i=0;i<compiled.operations.length;i+=10){
  try{document=applyCreationTransaction(document,{protocolVersion:2,transactionId:`new-layout-${templateIndex}-${i}`,baseSceneRevision:creationSceneRevision(document),operations:compiled.operations.slice(i,i+10)},selected).document;}
  catch(error){throw new Error(`${templateId} 操作 ${i+1}-${Math.min(i+10,compiled.operations.length)} 失败：${error.message}`,{cause:error});}
 }
 const mmPerPx=LAYOUT_LEAF_MM[1]/document.page.canvas.height,actual=document.page.layers.filter(l=>l.type==='material').map(l=>{
  const source=selected.find(a=>a.id===l.assetID),rendered=[l.width*mmPerPx,l.height*mmPerPx];
  if(!source||Math.abs(rendered[0]-source.physicalWidthMM)>.15||Math.abs(rendered[1]-source.physicalHeightMM)>.15)throw Error(`${templateId} 素材 ${l.creativePieceID} 被缩放`);
  return {slot:l.creativePieceID,asset:source.alias,sourceMm:[source.physicalWidthMM,source.physicalHeightMM],renderedMm:rendered.map(x=>Math.round(x*100)/100)};
 });
 const slotAudit=describeThreeLayoutSpread(templateId).slots.map(slot=>{
  const layer=document.page.layers.find(l=>(l.creativePieceID||l.id)===slot.id);
  if(!layer)return {slot:slot.id,missing:true};
  const mask=layer.vectorMask?.outer;
  const minX=mask?Math.min(...mask.map(p=>p[0])):0,maxX=mask?Math.max(...mask.map(p=>p[0])):1;
  const minY=mask?Math.min(...mask.map(p=>p[1])):0,maxY=mask?Math.max(...mask.map(p=>p[1])):1;
  const actualBox=[layer.x-layer.width/2+minX*layer.width,layer.y-layer.height/2+minY*layer.height,layer.x-layer.width/2+maxX*layer.width,layer.y-layer.height/2+maxY*layer.height];
  const leafWidth=document.page.canvas.width/2,leafHeight=document.page.canvas.height,pageOffset=slot.page==='right'?leafWidth:0;
  const expected=[pageOffset+slot.box[0]/100*leafWidth,slot.box[1]/100*leafHeight,pageOffset+slot.box[2]/100*leafWidth,slot.box[3]/100*leafHeight];
  const deltas=actualBox.map((v,i)=>Math.round((v-expected[i])*mmPerPx*100)/100);
  return {slot:slot.id,role:slot.role,expectedMm:[slot.box[0]*1.25,slot.box[1]*1.76,slot.targetMm[0],slot.targetMm[1]],placementErrorMm:deltas,overflowMm:Math.max(0,deltas[3])};
 });
 const audited=slotAudit.filter(a=>['photo','paper','circle','strip','accent'].includes(a.role));
 const maxGeometryErrorMm=Math.max(...audited.flatMap(a=>a.placementErrorMm.map(Math.abs)));
 if(maxGeometryErrorMm>1.5)throw Error(`${templateId} 槽位可见几何偏差 ${maxGeometryErrorMm} mm`);
 const required=describeThreeLayoutSpread(templateId).slots.map(slot=>slot.id);
 const missingRequired=required.filter(id=>!document.page.layers.some(l=>(l.creativePieceID||l.id)===id));
 if(missingRequired.length)throw Error(`${templateId} 参考图必备对象缺失: ${missingRequired.join(', ')}`);
 const buffers=Object.fromEntries(await Promise.all(selected.map(async a=>[a.alias,await readFile(a.local)])));
 const {png,report}=await renderOfflinePNG(document.page,document.source,buffers,canvas);
 await Promise.all([writeFile(join(output,`${templateId}-初稿.png`),png),writeFile(join(output,`${templateId}-可编辑场景.json`),JSON.stringify(document,null,2)),writeFile(join(output,`${templateId}-匹配报告.json`),JSON.stringify({plan,actual,slotAudit,sourceMeasurement:sourceMeasurements[templateId],missingRequired,maxGeometryErrorMm,warnings:compiled.report.warnings,render:report},null,2))]);
 console.log(templateId,JSON.stringify({used:plan.used,missingPhotos:plan.missingPhotos,physicalVerified:actual.length,maxGeometryErrorMm,bytes:png.length}));
}

import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {loadOfflineCanvas,renderOfflinePNG} from '../src/offline-node-preview.mjs';
import {listSixSpreadTemplates,describeSixSpreadTemplate,matchSixSpreadMaterials,compileSixSpreadTemplate,SPREAD_LEAF_MM} from '../creative-agent/library/six-spread-templates.js';

const [manifestFile,profilesFile,outputArg]=process.argv.slice(2);
if(!manifestFile||!profilesFile)throw Error('用法：node scripts/render-six-spread-basket.mjs manifest.json profiles.json [output]');
const output=resolve(outputArg||'/tmp/shiye-six-spread'),manifest=JSON.parse(await readFile(manifestFile,'utf8')),
 profiles=JSON.parse(await readFile(profilesFile,'utf8')),
 assets=profiles.map(profile=>({...manifest.find(row=>row.alias===profile.alias),...profile,supply:{quantity:1}}));
if(assets.some(asset=>!asset.id||!asset.local))throw Error('素材画像与本地真实素材清单不一致');
await mkdir(output,{recursive:true});
await writeFile(join(output,'六模板槽位配置.json'),JSON.stringify(listSixSpreadTemplates().map(describeSixSpreadTemplate),null,2));
const canvas=await loadOfflineCanvas();
for(const templateId of listSixSpreadTemplates()){
 const plan=matchSixSpreadMaterials(templateId,assets),result=compileSixSpreadTemplate({templateId,assets,plan});
 if(!plan.compatible){
  await writeFile(join(output,`${templateId}-不适配报告.json`),JSON.stringify({
   templateId,compatible:false,missingCritical:plan.missingCritical,used:plan.used,
   reason:'输入素材缺少模板的关键视觉主体；不使用案例校准素材，也不以不相关素材充数。'
  },null,2));
  console.log(templateId,JSON.stringify({compatible:false,missingCritical:plan.missingCritical}));
  continue;
 }
 const page=draft({mode:'spread',ratio:'personal'}),selected=assets.filter(a=>plan.used.includes(a.alias));
 if(page.physicalPageHeightMM!==SPREAD_LEAF_MM[1])throw Error('双页尺寸假设与应用预设不一致');
 let document=await createCreationDocument({draft:page,assets:selected,aliases:Object.fromEntries(selected.map(a=>[a.alias,a.id])),title:`${templateId} 自动模板初稿`,prompt:'双页模板与真实素材，保持素材原始毫米尺寸'});
 for(let i=0;i<result.operations.length;i+=10){
  try{document=applyCreationTransaction(document,{protocolVersion:2,transactionId:`spread-${templateId.slice(0,3)}-real-${i}`,baseSceneRevision:creationSceneRevision(document),operations:result.operations.slice(i,i+10)},selected).document;}
  catch(error){throw new Error(`${templateId} 操作 ${i+1}-${Math.min(i+10,result.operations.length)} 失败：${error.message}`,{cause:error});}
 }
 const layerMm=SPREAD_LEAF_MM[1]/document.page.canvas.height;
 const actual=document.page.layers.filter(layer=>layer.type==='material').map(layer=>{
  const source=selected.find(a=>a.id===layer.assetID),visibleMm=[layer.width*layerMm,layer.height*layerMm];
  if(!source)throw Error(`${templateId} 缺少素材来源：${layer.creativePieceID}`);
  if(Math.abs(visibleMm[0]-source.physicalWidthMM)>.15||Math.abs(visibleMm[1]-source.physicalHeightMM)>.15)throw Error(`${templateId} 素材 ${layer.creativePieceID} 被缩放`);
  return {slot:layer.creativePieceID,asset:source.alias,sourceMm:[source.physicalWidthMM,source.physicalHeightMM],renderedMm:visibleMm.map(x=>Math.round(x*100)/100),physicalSizeVerified:true};
 });
 const buffers=Object.fromEntries(await Promise.all(selected.map(async a=>[a.alias,await readFile(a.local)])));
 const {png,report}=await renderOfflinePNG(document.page,document.source,buffers,canvas);
 await Promise.all([
  writeFile(join(output,`${templateId}-初稿.png`),png),
  writeFile(join(output,`${templateId}-可编辑场景.json`),JSON.stringify(document,null,2)),
  writeFile(join(output,`${templateId}-匹配报告.json`),JSON.stringify({plan,actual,warnings:result.report.warnings,render:report},null,2))
 ]);
 console.log(templateId,JSON.stringify({used:plan.used,physicalVerified:actual.length,warnings:result.report.warnings.length,bytes:png.length}));
}

import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {draft} from '../src/domain.js';
import {createCreationDocument} from '../src/creation-document.js';
import {applyCreationTransaction,creationSceneRevision} from '../src/creation-transaction.js';
import {loadOfflineCanvas,renderOfflinePNG} from '../src/offline-node-preview.mjs';
import {compileTemplateDraft} from '../creative-agent/library/template-draft.js';

const manifestPath=process.argv[2];
const outputDir=resolve(process.argv[3]||'/tmp/shiye-measured-case-cos');
if(!manifestPath)throw new Error('需要本地 COS 素材清单路径');
const rows=JSON.parse(await readFile(manifestPath,'utf8'));
const all=rows.map(({local,storagePath,blobId,bytes,index,...row})=>({...row,supply:{quantity:1}}));
const selections={
 D143:{'orange-clip':'c61','girl-head':'c144','yellow-label':'c66','telephone-girl':'c62'},
 D153:{'title-tape':'c70','plant-memo':'c97','orange-clip':'c66','banner-girl':'c62','yellow-dot-strip':'c61'},
 D158:{'walking-dog':'c144','dog-plants-card':'c52','gingham-tape':'c70','rabbit-charm':'c64','paperclip':'c61','manga-girl':'c67'},
 D162:{'bear-monday':'c64','red-arrow-round':'c66','heart-memo':'c81','tea-card':'c144','clip':'c61'}
};
const slotFits={
 D143:{},
 D153:{'plant-memo':{fit:'mask'},'orange-clip':{fit:'mask'},'banner-girl':{fit:'mask'},'yellow-dot-strip':{fit:'mask'}},
 D158:{'walking-dog':{fit:'mask'},'dog-plants-card':{fit:'mask'},'gingham-tape':{fit:'mask'},'rabbit-charm':{fit:'mask'},'paperclip':{fit:'mask'},'manga-girl':{fit:'mask'}},
 D162:{'bear-monday':{fit:'mask'},'red-arrow-round':{fit:'mask'},'heart-memo':{fit:'mask'},'clip':{fit:'mask'},'gingham-tape':{generated:true}}
};
const layerChecks={
 D153:[['white-ruled','gray-paper'],['bottom-tape','white-ruled'],['plant-border','gray-paper'],['plant-memo','plant-border'],['orange-clip','plant-memo'],['title-strip','gray-paper'],['title-tape','title-strip'],['orange-clip','title-strip'],['banner-girl','plant-memo'],['yellow-dot-strip','white-ruled']],
 D162:[['blue-upper','ruled-top'],['gingham-top','blue-upper'],['blue-lower','ruled-bottom'],['ruled-middle','blue-lower'],['middle-rule-573','ruled-middle'],['middle-rule-601','ruled-middle'],['middle-rule-629','ruled-middle'],['middle-rule-657','ruled-middle'],['gingham-middle','ruled-middle'],['heart-memo','blue-upper'],['heart-memo','blue-lower'],['heart-memo','gingham-middle'],['tea-card','blue-lower'],['gingham-bottom','tea-card'],['clip','tea-card']]
};
await mkdir(outputDir,{recursive:true});
const canvas=await loadOfflineCanvas();
for(const templateId of Object.keys(selections)){
 const bindings=selections[templateId],aliases=new Set(Object.values(bindings)),selected=all.filter(a=>aliases.has(a.alias));
 if(selected.length!==aliases.size)throw Error(`${templateId} 素材绑定不完整`);
 const compiled=compileTemplateDraft({templateId,assets:selected,bindings,slotValues:slotFits[templateId]});
 const [width,height]=compiled.report.pageMm,page=draft({ratio:'a5'});
 page.physicalPageHeightMM=height;page.canvas.width=page.canvas.height*width/height;
 let document=await createCreationDocument({draft:page,assets:selected,aliases:Object.fromEntries(selected.map(a=>[a.alias,a.id])),title:`${templateId} COS 素材模板初稿`,prompt:'确定性模板测试'});
 for(let i=0;i<compiled.operations.length;i+=12){
  try{document=applyCreationTransaction(document,{protocolVersion:2,transactionId:`${templateId}-cos-${i}`,baseSceneRevision:creationSceneRevision(document),operations:compiled.operations.slice(i,i+12)},selected).document;}
  catch(error){throw Error(`${templateId} 操作 ${i+1}-${i+12} 失败：${error.message}`,{cause:error});}
 }
 const layers=document.page.layers.map(layer=>({id:layer.creativePieceID||layer.id,type:layer.type,zIndex:layer.zIndex}));
 const z=Object.fromEntries(layers.map(layer=>[layer.id,layer.zIndex]));
 const checked=(layerChecks[templateId]||[]).filter(([front,back])=>front in z&&back in z).map(([front,back])=>({front,back,passed:z[front]>z[back]}));
 if(checked.some(row=>!row.passed))throw Error(`${templateId} 图层顺序不符：${checked.filter(row=>!row.passed).map(row=>`${row.front}/${row.back}`).join(', ')}`);
 if(layers.some(layer=>/^(?:page-|paper-|binding-)?hole-\d+$/.test(layer.id)))throw Error(`${templateId} 仍含装订孔`);
 await writeFile(join(outputDir,`${templateId}-图层核验.json`),JSON.stringify({layers,checked},null,2));
 const buffers=Object.fromEntries(await Promise.all(selected.map(async a=>[a.alias,await readFile(rows.find(r=>r.alias===a.alias).local)])));
 const {png,report}=await renderOfflinePNG(document.page,document.source,buffers,canvas);
 await writeFile(join(outputDir,`${templateId}-COS-真实素材.png`),png);
 await writeFile(join(outputDir,`${templateId}-可编辑场景.json`),JSON.stringify(document,null,2));
 await writeFile(join(outputDir,`${templateId}-槽位报告.json`),JSON.stringify({bindings,report:compiled.report,render:report},null,2));
 await writeFile(join(outputDir,`${templateId}-COS素材来源.json`),JSON.stringify(selected.map(a=>({alias:a.alias,assetId:a.id,title:a.title,kind:a.kind,physicalWidthMM:a.physicalWidthMM,physicalHeightMM:a.physicalHeightMM,sha256:createHash('sha256').update(buffers[a.alias]).digest('hex'),used:compiled.report.used.includes(a.alias)})),null,2));
 console.log(templateId,JSON.stringify({materials:compiled.report.used,layers:document.page.layers.length,bytes:png.length}));
}

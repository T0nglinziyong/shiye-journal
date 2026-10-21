import {strToU8} from 'fflate';
import {v3PackageLock} from './v3-package-lock.js';
import {v3SceneSchema} from './v3-scene-schema.js';
import {sha256Hex} from './task-fingerprint.js';
import {previewImageFormat} from './offline-preview.js';
import {creationFixedFiles,creationFixedReleaseId} from './generated/creation-fixed-source.js';
import {creationV2RuntimeSchema,creationRecipes} from './creation-v2-contract.js';
const encode=value=>strToU8(typeof value==='string'?value:JSON.stringify(value,null,2));
const fingerprint=async bytes=>'sha256:'+await sha256Hex(bytes);
async function overview(selected,chosen){
 let canvas,ctx,load,save;
 if(typeof document!=='undefined'){
  canvas=document.createElement('canvas');canvas.width=1200;canvas.height=Math.max(280,Math.ceil(selected.length/3)*300+100);ctx=canvas.getContext('2d');
  load=async bytes=>createImageBitmap(new Blob([bytes],{type:previewImageFormat(bytes).mimeType}));
  save=()=>new Promise((resolve,reject)=>canvas.toBlob(async blob=>blob?resolve(new Uint8Array(await blob.arrayBuffer())):reject(Error('无法生成素材总览')),'image/jpeg',.88));
 }else{
  const module=await import('canvas');canvas=module.createCanvas(1200,Math.max(280,Math.ceil(selected.length/3)*300+100));ctx=canvas.getContext('2d');
  load=bytes=>module.loadImage(Buffer.from(bytes));save=()=>new Uint8Array(canvas.toBuffer('image/jpeg',{quality:.88}));
 }
 ctx.fillStyle='#f3f3ed';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#304638';ctx.font='bold 34px sans-serif';ctx.fillText('拾页 · 素材总览（各件独立缩放，仅供观察）',32,52);
 for(const [index,item] of selected.entries()){
  const col=index%3,row=Math.floor(index/3),x=24+col*392,y=82+row*300;
  ctx.fillStyle='#fff';ctx.fillRect(x,y,376,282);ctx.strokeStyle='#ccd7ca';ctx.strokeRect(x,y,376,282);
  const entry=chosen.find(e=>e.alias===item.alias);
  for(let gy=0;gy<210;gy+=20)for(let gx=0;gx<334;gx+=20){ctx.fillStyle=(Math.floor(gx/20)+Math.floor(gy/20))%2?'#f7f7f3':'#e9ece7';ctx.fillRect(x+21+gx,y+7+gy,Math.min(20,334-gx),Math.min(20,210-gy));}
  if(entry){let image;try{image=await load(entry.bytes);}catch{throw Error('素材原图无法解码：'+item.alias);}entry.width=image.width;entry.height=image.height;const ratio=Math.min(334/image.width,210/image.height);ctx.drawImage(image,x+(376-image.width*ratio)/2,y+7,image.width*ratio,image.height*ratio);image.close?.();}
  ctx.fillStyle='#304638';ctx.font='bold 18px sans-serif';ctx.fillText(item.alias+' · '+item.title.slice(0,22),x+14,y+244);ctx.font='14px sans-serif';ctx.fillText(item.physicalWidthMM+' × '+item.physicalHeightMM+' mm · '+(item.kind||'素材'),x+14,y+268);
 }
 return save();
}
export async function createV3PackageFiles({source,selected,chosen,work,guide,runtime,glyph}){
 const overviewBytes=await overview(selected,chosen);
 const entries=await Promise.all(selected.map(async item=>{
  const original=chosen.find(e=>e.alias===item.alias);if(!original)throw Error('缺少素材原图：'+item.alias);
  const format=previewImageFormat(original.bytes);if(!format)throw Error('素材图片格式无效：'+item.alias);
  return {...item,image:'assets/'+item.alias+'.'+format.extension,sha256:await fingerprint(original.bytes),pixelWidth:original.width||null,pixelHeight:original.height||null,originalFilename:original.filename||item.title+'.'+format.extension};
 }));
 const task={format:'shiye-gpt-creation-package',version:3,protocolVersion:2,fixedReleaseId:creationFixedReleaseId,taskId:source.bundleId,title:source.title,intent:source.intent,userText:source.userText,providedFacts:source.providedFacts,styles:source.styles,purposes:source.purposes,contentPolicy:source.contentPolicy,creativeBrief:guide,page:{mode:source.mode,ratio:source.ratio,physicalPageHeightMM:work.page.physicalPageHeightMM,canvas:work.page.canvas},processing:source.processing,requiredAssetIDs:source.requiredAssetIDs,assetManifestRef:'assets/manifest.json',materials:entries.map(({alias,assetID,title,kind,journalRoles,physicalWidthMM,physicalHeightMM,image,sha256})=>({alias,assetID,title,kind,journalRoles,physicalWidthMM,physicalHeightMM,image,sha256})),sourceContext:source};
 const manifest={format:'shiye-v3-assets',version:3,taskId:source.bundleId,assets:entries.map(e=>{const snapshot=source.sourceSnapshots.find(row=>row.assetID===e.assetID);return {alias:e.alias,assetID:e.assetID,originalFilename:e.originalFilename,image:e.image,sha256:e.sha256,pixelWidth:e.pixelWidth,pixelHeight:e.pixelHeight,physicalWidthMM:e.physicalWidthMM,physicalHeightMM:e.physicalHeightMM,kind:e.kind,role:e.role,tags:e.tags,required:source.requiredAssetIDs.includes(e.assetID),sourceUnitIndex:0,processing:source.processing,allowedOperations:source.processing==='保留完整'?['whole','move','rotate']:['whole','crop','edge','window','partition','weave','move','rotate'],sourceRevision:snapshot?.sourceRevision||null,sourceDescriptor:snapshot?.descriptor||null};})};
 const revision=await fingerprint(new TextEncoder().encode(JSON.stringify(work)));
 const files={
  'START_HERE.md':encode(creationFixedFiles['START_HERE.md']),'TASK.json':encode(task),'scene.json':encode(work),'assets/overview.jpg':overviewBytes,'assets/manifest.json':encode(manifest),
  'design/GUIDE.md':encode(guide),'design/CRAFT_GUIDE.md':encode(creationFixedFiles['design/CRAFT_GUIDE.md']),'design/RECIPES.md':encode(creationRecipes()),
  'api/fixed-release.json':encode({releaseId:creationFixedReleaseId,protocolVersion:2,files:Object.keys(creationFixedFiles)}),'api/commands.schema.json':encode(creationV2RuntimeSchema),'api/scene.schema.json':encode(v3SceneSchema),
  'work/commands.json':encode({protocolVersion:2,transactionId:'initial-'+source.bundleId.slice(0,8),baseSceneRevision:revision,operations:[]}),
  'runtime/shiye.cjs':encode(runtime),'runtime/glyphs.cjs':encode(glyph),
  'package.json':encode({name:'shiye-gpt-creation-v3',private:true,version:'3.0.0',dependencies:{canvas:'3.2.3'}}),'package-lock.json':encode(v3PackageLock)
 };
 for(const entry of entries)files[entry.image]=chosen.find(item=>item.alias===entry.alias).bytes;
 return files;
}

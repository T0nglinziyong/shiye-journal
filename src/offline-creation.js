import {webSceneContract,webSceneDocument,importWebScene} from './web-scene-workbench.js';
import {createV3PackageFiles} from './v3-package.js';
import {webArtDirection} from './web-creation-guide.js';
import {previewImageFormat} from './offline-preview.js';
import {webResultPrompt} from './creation-methods.js';
import {freezeCraftTask} from './craft-task.js';
import {zip,zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {toolContracts,schemaFingerprint} from './creative-contract.js';
import {structureReferenceGuide} from './creative-design-guide.js';
import {validMaterialAlias} from './material-alias.js';
import {importNativeProjectPackage,validatePackageValue} from './native-project-package.js';
import {readProjectPackageEntries} from './project-package-archive.js';
import {canonicalTaskSource} from './task-source.js';
import {sha256Hex,taskFingerprint,assertTaskFingerprint} from './task-fingerprint.js';
import {reviewExternalResultFiles} from './offline-result-review.js';
import {creativeContentBrief} from './creative-content-brief.js';
import {creativePageBrief} from './creative-page-brief.js';
import {imagePrompt} from './ai-image-generation.js';
import {classifyJournalMaterial} from './journal-case-study.js';
import {tapeDimensions,tapeRepeatRange} from './tape-strip.js';

export const OFFLINE_PACKAGE_FORMAT='shiye-gpt-creation-package';
function packagePreviewPath(folder,name,bytes,{transparent=false}={}){
 const format=previewImageFormat(bytes);
 if(!format||(transparent&&format.extension==='jpg'))throw Error('创作预览格式无效；真实素材必须保留透明通道');
 return `${folder}/${name}.${format.extension}`;
}
export const EDITABLE_WORK_FORMAT='shiye-editable-project';
export const EDITABLE_PACKAGE_ENTRY='project.shiyeproject.json';
const validAlias=validMaterialAlias;
function sourceFor(p,aliases){
 const d=p.drafts[0],priority=p.materialPriority||{required:p.requiredAssetIDs||[],preferred:Object.values(aliases).filter(id=>!(p.requiredAssetIDs||[]).includes(id)),available:[]};
 return structuredClone({bundleId:crypto.randomUUID(),title:p.title,mode:d.pageMode,ratio:d.pageRatio,styles:p.styles||[d.style],purposes:p.purposes||[p.purpose||'自由创作'],intent:p.intent||'',contentPolicy:p.contentPolicy||'original',textPresentation:p.textPresentation||'mixed',userText:p.userText||'',providedFacts:p.providedFacts||'',processing:p.processing||'自由拆解',requiredAssetIDs:p.requiredAssetIDs||[],materialPriority:{required:priority.required||[],preferred:priority.preferred||[],available:priority.available||[]},materials:Object.entries(aliases).map(([alias,assetID])=>({alias,assetID}))});
}
// Alias shortening happens before freezing/hashing the task. Persistent asset
// IDs never change, and images and source references share the same mapping.
export async function createOfflineHandoff({project:p,assets,aliases,previews=[],settings={}}){
 if(settings.deliveryMode!=='image'){
  const entries=Object.entries(aliases);
  if(entries.some(([alias])=>!validAlias(alias)))throw Error('素材篮中有无效素材编号');
  const short=new Map(entries.map(([alias],index)=>[alias,'m'+(index+1)]));
  aliases=Object.fromEntries(entries.map(([alias,id])=>[short.get(alias),id]));
  previews=previews.map(entry=>({...entry,alias:short.get(entry.alias)||entry.alias}));
 }
 const source=sourceFor(p,aliases);source.taskBinding='local';source.textMode=source.contentPolicy==='visual'?'none':settings.textMode||'automatic';
 const selected=source.materials.map(({alias,assetID})=>{
  const asset=assets.find(item=>item.id===assetID);if(!asset||!validAlias(alias))throw Error('素材篮中有无效素材编号');
  return {alias,assetID,title:asset.title,kind:asset.kind,role:asset.role,journalRoles:classifyJournalMaterial(asset),physicalWidthMM:asset.physicalWidthMM,physicalHeightMM:asset.physicalHeightMM,continuousTape:asset.kind==='tape',tape:asset.kind==='tape'?{axis:tapeDimensions(asset).axis,widthMM:tapeDimensions(asset).widthMM,sourceLengthMM:tapeDimensions(asset).lengthMM,repeatRangeMM:tapeRepeatRange(asset),flatCrop:asset.tapeFlatCrop??null,textureModes:['sample',...(tapeRepeatRange(asset)?['repeat']:[]),'stretch'],capStyles:['square','angled','torn']}:null,tags:asset.tags||[]};
 });
 if(!selected.length)throw Error('请先选择素材');
 const showImages=settings.includeThumbnails!==false,chosen=showImages?previews:[];
 if(showImages&&selected.some(item=>!chosen.some(preview=>preview.alias===item.alias&&preview.bytes instanceof Uint8Array&&preview.bytes.length)))throw Error('创作包缺少素材预览，未导出不完整文件');
 if(settings.deliveryMode==='image')for(const entry of chosen)packagePreviewPath('materials',entry.alias,entry.bytes,{transparent:true});
 if(settings.deliveryMode==='image')return createOfflineImageHandoff({source,project:p,assets,selected,chosen,settings,showImages});
 const {offlineValidateSource}=await import('./generated/offline-validate-source.js'),{offlineGlyphSource}=await import('./generated/offline-glyph-source.js'),mode='scene';
 source.capabilities={sceneWorkbench:true,cropPx:false,craftPlan:true,multimodalVision:showImages,twoHoleWeave:true,editableTapeRibbon:true,canonicalNodePreview:true,validateOffline:true,previewOffline:'node-canvas'};
 source.packageLayout='v3';source.schemaHash=schemaFingerprint(webSceneContract);source.planSchemaHash=schemaFingerprint(toolContracts.apply_craft_plan);
 freezeCraftTask(source,p.drafts[0],assets);
 source.previewHashes=showImages?Object.fromEntries(await Promise.all(chosen.map(async entry=>[entry.alias,`sha256:${await sha256Hex(entry.bytes)}`]))):null;
 source.taskHash=await taskFingerprint(source);
 const work=webSceneDocument(source,source.baseDraft,p.title);
 const guide=[creativeContentBrief({policy:source.contentPolicy,userText:source.userText,providedFacts:source.providedFacts,topic:source.intent,purposes:source.purposes}),creativePageBrief({styles:source.styles,purposes:source.purposes,textMode:source.textMode,contentPolicy:source.contentPolicy,textPresentation:source.textPresentation,userText:source.userText,theme:source.intent,pageMode:source.mode,materials:selected}),webArtDirection(source),'先观察素材并构思素材之间的关系；只写 work/commands.json，经 apply 修改唯一 scene.json 后看真实预览。按需 help / describe；使用 material.crop、material.split、material.window、material.weave，曲线文字、胶带路径、字形镂空等同样使用公共参数；默认 describe 返回精简帮助，完整规范加 --full。',settings.customLayoutPrompt||'',settings.includeStructureReference===false?'':structureReferenceGuide].join('\n\n');
 const files=await createV3PackageFiles({source,selected,chosen,work,guide,runtime:offlineValidateSource,glyph:offlineGlyphSource}),bytes=zipSync(files,{level:4}),prompts={file:webResultPrompt(mode,'file'),text:webResultPrompt(mode,'text')};
 return {blob:new Blob([bytes],{type:'application/zip'}),filename:'拾页-GPT创作任务.zip',prompt:prompts.file,prompts,source,mode,previewCount:chosen.length,imageBytes:chosen.reduce((total,item)=>total+item.bytes.length,0),packageBytes:bytes.length};
}
async function createOfflineImageHandoff({source,project:p,assets,selected,chosen,settings,showImages}){
 source.deliveryMode='image';source.packageLayout='compact-v2';source.previewHashes=showImages?Object.fromEntries(await Promise.all(chosen.map(async entry=>[entry.alias,`sha256:${await sha256Hex(entry.bytes)}`]))):null;source.taskHash=await taskFingerprint(source);
 const context={format:OFFLINE_PACKAGE_FORMAT,version:2,deliveryMode:'image',source,materials:selected.map(item=>({...item,preview:showImages?packagePreviewPath('materials',item.alias,chosen.find(entry=>entry.alias===item.alias)?.bytes,{transparent:true}):null}))};
 const brief=imagePrompt({project:p,draft:p.drafts[0],assets,ids:selected.map(item=>item.assetID),theme:p.intent||'',requireAll:settings.requireAllCandidates!==false,includeImages:showImages,textMode:source.textMode});
 const imageOrder=selected.map((item,index)=>`${index+1} = ${item.alias}${showImages?` (${packagePreviewPath('materials',item.alias,chosen.find(entry=>entry.alias===item.alias)?.bytes,{transparent:true})})`:''}`).join('；');
 const start=`拾页手帐画面图片任务｜一次完成\n\n先读 task/context.json 与 task/GUIDE.txt，然后${showImages?'逐件查看 materials/ 中的透明图片（WebP 或 PNG）':'依据素材名称、标签与尺寸'}。\n\n素材编号：${imageOrder}\n\n最终在聊天中展示画面，并交付一张可下载 PNG。它是不可逐层编辑的画面快照，不要返回工程数据或代码。`;
 const files={'START_HERE.txt':strToU8(start),'task/context.json':strToU8(JSON.stringify(context,null,2)),'task/GUIDE.txt':strToU8(brief)};
 for(const entry of chosen)if(validAlias(entry.alias)&&source.materials.some(item=>item.alias===entry.alias))files[packagePreviewPath('materials',entry.alias,entry.bytes,{transparent:true})]=entry.bytes;
 const bytes=await new Promise((resolve,reject)=>zip(files,{level:4},(error,result)=>error?reject(error):resolve(result))),prompt=webResultPrompt('image','file');
 return {blob:new Blob([bytes],{type:'application/zip'}),filename:'拾页-AI画面任务.zip',prompt,prompts:{file:prompt,text:null},source,mode:'image',deliveryMode:'image',previewCount:chosen.length,imageBytes:chosen.reduce((total,item)=>total+item.bytes.length,0),packageBytes:bytes.length};
}
export function inspectEditableSource(text){
 if(new TextEncoder().encode(text).byteLength>8_000_000)throw Error('可编辑作品文件过大');
 const blocks=[...text.matchAll(/```(?:json|shiyeproject)?\s*([\s\S]*?)```/gi)].map(match=>match[1].trim()).filter(block=>block.includes(EDITABLE_WORK_FORMAT));
 if(blocks.length>1)throw Error('检测到多个可编辑数据块，请只复制其中一个');
 let input;try{input=JSON.parse(blocks[0]||text.trim());}catch{throw Error('可编辑作品不是有效 JSON');}validatePackageValue(input);return input;
}
export function importEditableWork(text,assets,{trustedSource=null}={}){
 const input=inspectEditableSource(text);if(input?.format!==EDITABLE_WORK_FORMAT||input.version!==1)throw Error('不是拾页可编辑作品文件');
 if(!input.source?.capabilities?.sceneWorkbench)throw Error('请使用当前网页版创作包，最终交付原生 Scene 图层');return importWebScene(input,assets,{trustedSource});
}
export function inspectEditablePackageSource(bytes){
 const {kind,files}=readProjectPackageEntries(bytes);return kind==='editable'?inspectEditableSource(strFromU8(files[EDITABLE_PACKAGE_ENTRY])).source:null;
}
export function inspectOfflinePackage(bytes){
 const {kind,files}=readProjectPackageEntries(bytes,{allowTask:true});
 if(kind==='editable')return {kind,source:inspectEditableSource(strFromU8(files[EDITABLE_PACKAGE_ENTRY])).source};if(kind==='native')return {kind,source:null};
 let context;try{context=JSON.parse(strFromU8(files['TASK.json']));}catch{throw Error('原始任务包的 TASK.json 无效');}validatePackageValue(context);
 if(context?.format!==OFFLINE_PACKAGE_FORMAT||context.version!==3||context.sourceContext?.taskBinding!=='local'||context.sourceContext?.packageLayout!=='v3'||!Array.isArray(context.materials)||!context.sourceContext?.materials?.length)throw Error('不是可登记的网页 AI 原始任务包');
 if(canonicalTaskSource(context.materials.map(({alias,assetID})=>({alias,assetID})))!==canonicalTaskSource(context.sourceContext.materials))throw Error('原始任务包素材映射不一致');return {kind,source:context.sourceContext};
}
export async function verifyOfflineTaskPackage(bytes,source){
 await assertTaskFingerprint(source);
 if(!Object.hasOwn(source,'previewHashes'))throw Error('原始任务缺少当前素材预览指纹字段');
 const expected=source.previewHashes;if(expected===null)return;
 if(!expected||typeof expected!=='object'||Array.isArray(expected)||Object.keys(expected).length!==source.materials.length)throw Error('原始任务的素材预览指纹不完整');
 readProjectPackageEntries(bytes,{allowTask:true});const previews=unzipSync(bytes,{filter:entry=>entry.name.startsWith('assets/')});
 for(const item of source.materials){
  const fingerprint=expected[item.alias],names=['webp','png','jpg'].map(ext=>`assets/${item.alias}.${ext}`).filter(path=>previews[path]);if(names.length!==1)throw Error(`原始任务素材 ${item.alias} 的预览文件不唯一或缺失`);
  const image=previews[names[0]],format=previewImageFormat(image);if(!format||names[0]!==`assets/${item.alias}.${format.extension}`)throw Error(`原始任务素材 ${item.alias} 的图片内容与格式不一致`);
  if(!/^sha256:[a-f0-9]{64}$/.test(fingerprint||'')||`sha256:${await sha256Hex(image)}`!==fingerprint)throw Error(`原始任务素材 ${item.alias} 的预览与指纹不一致`);
 }
}
export function importEditableWorkPackage(bytes,assets,options={}){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>20_000_000)throw Error('可编辑作品包不能超过 20 MB');
 const native=importNativeProjectPackage(bytes,assets);if(native)return native;
 let files;try{files=unzipSync(bytes,{filter:file=>{if(file.name!==EDITABLE_PACKAGE_ENTRY)return false;if(file.originalSize>8_000_000)throw Error('作品图层数据不能超过 8 MB');return true;}});}catch(error){throw Error('无法读取可编辑作品包：'+error.message);}
 const scene=files[EDITABLE_PACKAGE_ENTRY];if(!scene)throw Error('作品包缺少 '+EDITABLE_PACKAGE_ENTRY);return importEditableWork(strFromU8(scene),assets,options);
}
export async function importEditableWorkPackageReviewed(bytes,assets,options={}){
 const imported=importEditableWorkPackage(bytes,assets,options),{kind,files}=readProjectPackageEntries(bytes);if(kind!=='editable'||!imported.creationVerification)return imported;
 const scene=inspectEditableSource(strFromU8(files[EDITABLE_PACKAGE_ENTRY])),review=await reviewExternalResultFiles(files,scene);imported.creationVerification={...imported.creationVerification,...review};return imported;
}

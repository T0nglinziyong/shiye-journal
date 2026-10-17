import {webSceneContract,webSceneCapabilities,webSceneDocument,importWebScene} from './web-scene-workbench.js';
import {webWorkbenchInstructions,webEditingGuide,webArtDirection} from './web-creation-guide.js';
import {attachSceneV2} from './scene-v2.js';
import {itemFromAsset,textBlock} from './domain.js';
import {previewImageFormat} from './offline-preview.js';
import {webResultPrompt} from './creation-methods.js';
import {offlineCreationPlanningData,offlineVisualReviewChecklist} from './offline-creation-workflow.js';
import {multimodalCraftGuide} from './craft-vision.js';
import {freezeCraftTask,craftTaskInstructions} from './craft-task.js';
import {materialCraftGuide} from './material-craft-guide.js';
import {zip,unzipSync,strToU8,strFromU8} from 'fflate';
import {toolContracts,offlinePlanContract,directPageContract,offlineContract,schemaFingerprint} from './creative-contract.js';
import {visualStyleBrief} from './creative-style-brief.js';
import {creativeDesignGuide,purposeMethod,structureReferenceGuide} from './creative-design-guide.js';
import {validMaterialAlias} from './material-alias.js';
import {importNativeProjectPackage,validatePackageValue} from './native-project-package.js';
import {readProjectPackageEntries} from './project-package-archive.js';
import {canonicalTaskSource} from './task-source.js';
import {sha256Hex,taskFingerprint,assertTaskFingerprint} from './task-fingerprint.js';
import {reviewExternalResultFiles} from './offline-result-review.js';
import {creativeContentBrief} from './creative-content-brief.js';
import {creativePageBrief} from './creative-page-brief.js';
import {imagePrompt} from './ai-image-generation.js';
import {classifyJournalMaterial,journalMaterialRoles,relevantJournalFamilies} from './journal-case-study.js';
import {journalReferenceGuide,selectJournalReferenceCases} from './journal-reference-catalog.js';
import {journalAbstractTemplateGuide,selectJournalAbstractTemplates} from './journal-abstract-templates.js';
import {journalSourceAudit,journalVerifiedPairs} from './journal-source-audit.js';

export const OFFLINE_PACKAGE_FORMAT='shiye-gpt-creation-package';
function packagePreviewPath(folder,name,bytes,{transparent=false}={}){
  const format=previewImageFormat(bytes);
  if(!format||(transparent&&format.extension==='jpg'))
    throw Error('创作预览格式无效；真实素材必须保留透明通道');
  return `${folder}/${name}.${format.extension}`;
}

export const EDITABLE_WORK_FORMAT='shiye-editable-project';
export const EDITABLE_PACKAGE_ENTRY='project.shiyeproject.json';
const compositionIdeas=source=>relevantJournalFamilies(source).map(({name,purposes,method,materials})=>({name,use:purposes.join('、'),plan:method,materialRoles:materials}));
const validAlias=validMaterialAlias;
function validateTemplateReferences(selectedCases,selectedTemplates,referenceImages){
  const required=[...selectedCases.map(entry=>entry.id),...selectedTemplates.filter(entry=>entry.templateBlobId).map(entry=>`${entry.id}-template`),...selectedTemplates.filter(entry=>entry.exampleBlobId).map(entry=>`${entry.id}-case`)];
  const selected=new Set([...required,...selectedTemplates.flatMap(entry=>[`${entry.id}-template`,`${entry.id}-case`])]);
  const ids=new Set();
  for(const entry of referenceImages){
    if(!selected.has(entry.id)||ids.has(entry.id)||!(entry.bytes instanceof Uint8Array)||!entry.bytes.length)throw Error('匹配的手帐案例或模板图尚未准备完整');
    ids.add(entry.id);
  }
  if(required.some(id=>!ids.has(id)))throw Error('匹配的手帐案例或模板图尚未准备完整');
}

function sourceFor(p,aliases){
  const d=p.drafts[0];
  const priority=p.materialPriority||{required:p.requiredAssetIDs||[],preferred:Object.values(aliases).filter(id=>!(p.requiredAssetIDs||[]).includes(id)),available:[]};
  return structuredClone({bundleId:crypto.randomUUID(),title:p.title,mode:d.pageMode,ratio:d.pageRatio,styles:p.styles||[d.style],purposes:p.purposes||[p.purpose||'日常记录'],intent:p.intent||'',contentPolicy:p.contentPolicy||'documentary',textPresentation:p.textPresentation||'mixed',userText:p.userText||'',providedFacts:p.providedFacts||'',processing:p.processing||'不预设',requiredAssetIDs:p.requiredAssetIDs||[],materialPriority:{required:priority.required||[],preferred:priority.preferred||[],available:priority.available||[]},materials:Object.entries(aliases).map(([alias,assetID])=>({alias,assetID}))});
}
// The upload is a task package, not a source archive. Keep the chat prompt
// short and put exact context, contracts, examples and separate images inside.
export async function createOfflineHandoff({project:p,assets,aliases,previews=[],settings={},referenceImages=[],userTemplates=[]}){
  const source=sourceFor(p,aliases);source.taskBinding='local';source.textMode=source.contentPolicy==='visual'?'none':settings.textMode||'automatic';const selected=source.materials.map(({alias,assetID})=>{
    const asset=assets.find(item=>item.id===assetID);
    if(!asset||!validAlias(alias))throw Error('素材篮中有无效素材编号');
    return {alias,assetID,title:asset.title,kind:asset.kind,role:asset.role,journalRoles:classifyJournalMaterial(asset),physicalWidthMM:asset.physicalWidthMM,physicalHeightMM:asset.physicalHeightMM,continuousTape:asset.kind==='tape',tags:asset.tags||[]};
  });
  if(!selected.length)throw Error('请先选择素材');
  const showImages=settings.includeThumbnails!==false;
  const chosen=showImages?previews:[];
  if(showImages&&selected.some(item=>!chosen.some(preview=>preview.alias===item.alias&&preview.bytes instanceof Uint8Array&&preview.bytes.length)))throw Error('创作包缺少素材预览，未导出不完整文件');
  for(const entry of chosen)packagePreviewPath('materials',entry.alias,entry.bytes,{transparent:true});
  if(settings.deliveryMode==='image')return createOfflineImageHandoff({source,project:p,assets,selected,chosen,settings,referenceImages,showImages,userTemplates});
  const {offlineValidateSource}=await import('./generated/offline-validate-source.js');
  const {offlineGlyphSource}=await import('./generated/offline-glyph-source.js');
  const mode='scene';
  source.capabilities={sceneWorkbench:true,cropPx:false,craftPlan:true,multimodalVision:showImages,twoHoleWeave:true,canonicalBrowserPreview:true,validateOffline:true,previewOffline:'canvas'};
  source.packageLayout='compact';
  source.schemaHash=schemaFingerprint(webSceneContract);source.planSchemaHash=schemaFingerprint(toolContracts.apply_craft_plan);
  freezeCraftTask(source,p.drafts[0],assets);
  source.previewHashes=showImages?Object.fromEntries(await Promise.all(chosen.map(async entry=>[entry.alias,`sha256:${await sha256Hex(entry.bytes)}`]))):null;
  source.taskHash=await taskFingerprint(source);
  const context={format:OFFLINE_PACKAGE_FORMAT,version:2,source,materials:selected.map(item=>({...item,preview:showImages?packagePreviewPath('materials',item.alias,chosen.find(entry=>entry.alias===item.alias)?.bytes,{transparent:true}):null}))};
  const hasPresets=settings.sendPresetReferences===true;
  const selectedCases=selectJournalReferenceCases({styles:source.styles,purposes:source.purposes,materials:selected});
  const selectedTemplates=selectJournalAbstractTemplates(selectedCases,{styles:source.styles,purposes:source.purposes,materials:selected,userTemplates});
  if(hasPresets)validateTemplateReferences(selectedCases,selectedTemplates,referenceImages);
  if(hasPresets)for(const entry of referenceImages)packagePreviewPath('references',entry.id,entry.bytes);
  const work=webSceneDocument(source,source.baseDraft,p.title);
  const exampleDraft=attachSceneV2(structuredClone(source.baseDraft));
  if(!exampleDraft.layers.length){
    const ids=new Set([selected[0].assetID,...source.requiredAssetIDs]);
    for(const [index,id] of [...ids].entries()){
      const item=itemFromAsset(assets.find(a=>a.id===id),exampleDraft,exampleDraft.canvas.width*(.25+index%3*.25),exampleDraft.canvas.height*(.4+Math.floor(index/3)*.1));
      item.id='example-material-'+index;item.type='material';item.creativePieceID='piece-'+index;exampleDraft.layers.push(item);
    }
    if(source.textMode!=='none'){
      const title=textBlock('这一页的主题',exampleDraft);title.id='example-title';title.type='text';title.fontName='';title.style='serif';exampleDraft.layers.push(title);
    }
  }
  const example=webSceneDocument(source,exampleDraft,'字段示例（请重新创作）');
  const knowledge={format:'shiye-gpt-task-knowledge',version:3,
    capabilities:{...webSceneCapabilities,runtime:{validate:'node20',render:'browser-html-manual',preview:'canvas',visualReview:'manual-required'},craft:{plan:true,observations:showImages,twoHoleWeave:true,glyphGeometry:'local-font-required'}},
    regions:source.sourceSnapshots.map(snapshot=>({assetID:snapshot.assetID,sourceRevision:snapshot.sourceRevision})),
    compositionIdeas:compositionIdeas(source).slice(0,3),caseStudies:{families:relevantJournalFamilies(source),selectedCases:hasPresets?selectedCases.map(({id,title,method})=>({id,title,method})):[]}};
  if(hasPresets){
    knowledge.abstractTemplates={note:'只借鉴方法，不照搬素材或坐标',templates:selectedTemplates};
    const refs=new Set(referenceImages.map(e=>e.id));knowledge.sourceImageAudit={images:journalSourceAudit.filter(row=>refs.has(row.id))};
  }
  const guide=[creativeContentBrief({policy:source.contentPolicy,userText:source.userText,providedFacts:source.providedFacts,topic:source.intent,purposes:source.purposes}),
    creativePageBrief({styles:source.styles,purposes:source.purposes,textMode:source.textMode,contentPolicy:source.contentPolicy,textPresentation:source.textPresentation,userText:source.userText,theme:source.intent,pageMode:source.mode}),
    webArtDirection(source),'所有静态对象在 page.layers 中编辑；完整字段与命令见 task/EDITING.txt。',settings.customLayoutPrompt||'',settings.includeStructureReference===false?'':structureReferenceGuide].join('\n\n');
  const files={
    'START_HERE.txt':strToU8(webWorkbenchInstructions),
    'scene.json':strToU8(JSON.stringify(work,null,2)),
    'task/context.json':strToU8(JSON.stringify(context,null,2)),
    'task/WORKFLOW.txt':strToU8(webWorkbenchInstructions),
    'task/EDITING.txt':strToU8(webEditingGuide),
    'task/CAPABILITIES.json':strToU8(JSON.stringify(webSceneCapabilities,null,2)),
    'task/material-planning.json':strToU8(JSON.stringify(offlineCreationPlanningData(source,selected,{mode,hasImages:showImages}),null,2)),
    'task/VISUAL_REVIEW.txt':strToU8(offlineVisualReviewChecklist+'\n\n'+webArtDirection(source)),
    'task/GUIDE.txt':strToU8(guide),
    'task/CRAFT_GUIDE.txt':strToU8(craftTaskInstructions+'\n统一遵守 source.processing；没有逐件用法覆盖。\n'+materialCraftGuide+'\n'+multimodalCraftGuide+'\n逐件查看 materials/ 的实际图案，在 decisions 说明取舍；可用 observed_region 引用本次看图观察。完整使用可以是最佳决定，不设工艺数量指标。'),
    'task/knowledge.json':strToU8(JSON.stringify(knowledge,null,2)),
    'schema/output.json':strToU8(JSON.stringify(webSceneContract,null,2)),
    'schema/scene.json':strToU8(JSON.stringify(webSceneContract,null,2)),
    'schema/tools.json':strToU8(JSON.stringify(offlineContract('agent',{cropPx:false}),null,2)),
    'schema/convenient-page.json':strToU8(JSON.stringify(directPageContract,null,2)),
    'schema/craft-plan.json':strToU8(JSON.stringify(toolContracts.apply_craft_plan,null,2)),
    'examples/project.shiyeproject.json':strToU8(JSON.stringify(example,null,2)),
    'examples/instructions.json':strToU8(JSON.stringify({tools:[{name:'compose_page',arguments:{materials:[{asset:selected[0].alias,piece:'hero',x:.5,y:.45}],paper:{color:'#fcfaf0',pattern:'plain'}}}]},null,2)),
    'runtime/glyphs.cjs':strToU8(offlineGlyphSource),
    'runtime/validate.cjs':strToU8(offlineValidateSource),
    'runtime/README.txt':strToU8(webWorkbenchInstructions+'\n\n'+webEditingGuide)
  };
  for(const name of ['inspect','compile','apply','preview','save-preview','pack','self-test'])files['runtime/'+name+'.cjs']=strToU8(`process.argv.splice(2,0,'${name}');require('./validate.cjs');\n`);
  for(const entry of chosen)if(validAlias(entry.alias)&&source.materials.some(item=>item.alias===entry.alias))files[packagePreviewPath('materials',entry.alias,entry.bytes,{transparent:true})]=entry.bytes;
  if(hasPresets)for(const entry of referenceImages)files[packagePreviewPath('references',entry.id,entry.bytes)]=entry.bytes;
  const bytes=await new Promise((resolve,reject)=>zip(files,{level:4},(error,result)=>error?reject(error):resolve(result)));
  const prompts={file:webResultPrompt(mode,'file'),text:webResultPrompt(mode,'text')};
  return {blob:new Blob([bytes],{type:'application/zip'}),filename:'拾页-GPT创作任务.zip',prompt:prompts.file,prompts,source,mode,previewCount:chosen.length,imageBytes:[...chosen,...(hasPresets?referenceImages:[])].reduce((total,item)=>total+item.bytes.length,0),packageBytes:bytes.length};
}

async function createOfflineImageHandoff({source,project:p,assets,selected,chosen,settings,referenceImages,showImages,userTemplates=[]}){
  const hasPresets=settings.sendPresetReferences===true;
  const selectedCases=selectJournalReferenceCases({styles:source.styles,purposes:source.purposes,materials:selected});
  const selectedTemplates=selectJournalAbstractTemplates(selectedCases,{styles:source.styles,purposes:source.purposes,materials:selected,userTemplates});
  if(hasPresets)validateTemplateReferences(selectedCases,selectedTemplates,referenceImages);
  if(hasPresets)for(const entry of referenceImages)packagePreviewPath('references',entry.id,entry.bytes);
  source.deliveryMode='image';source.packageLayout='compact-v2';
  source.previewHashes=showImages?Object.fromEntries(await Promise.all(chosen.map(async entry=>[entry.alias,`sha256:${await sha256Hex(entry.bytes)}`]))):null;
  source.taskHash=await taskFingerprint(source);
  const context={format:OFFLINE_PACKAGE_FORMAT,version:2,deliveryMode:'image',source,materials:selected.map(item=>({...item,preview:showImages?packagePreviewPath('materials',item.alias,chosen.find(entry=>entry.alias===item.alias)?.bytes,{transparent:true}):null}))};
  // Reuse the exact creative brief sent to the API image model. Only the
  // transport and the final handoff format differ for the web conversation.
  const brief=imagePrompt({project:p,draft:p.drafts[0],assets,ids:selected.map(item=>item.assetID),theme:p.intent||'',requireAll:settings.requireAllCandidates!==false,includeImages:showImages,includeReferences:hasPresets,textMode:source.textMode});
  const imageOrder=selected.map((item,index)=>`${index+1} = ${item.alias}${showImages?` (${packagePreviewPath('materials',item.alias,chosen.find(entry=>entry.alias===item.alias)?.bytes,{transparent:true})})`:''}`).join('；');
  const instructions=`拾页手帐画面图片任务｜一次完成\n\n你收到的是创作参考 ZIP，不是要返回的作品格式。请先读 task/context.json 与 task/knowledge.json${hasPresets?'、abstract-templates.json':''}，并${showImages?'查看 materials/ 中每件素材的透明图片':'依据素材名称、标签与尺寸'}；素材编号对应：${imageOrder}。${hasPresets?'references/ 中的匹配手帐案例和用户原图可核对的抽象模板只供构图启发；':''}按以下与拾页 API 图像创作一致的要求完成：\n\n${brief}\n\n请在聊天中展示最终画面，并提供可下载的 PNG 图片。图片是不可逐层编辑的画面快照；不要输出可编辑工程包、数据文件或代码。保持纸张比例，导入拾页后存入「画面快照」。`;
  const imageKnowledge={format:'shiye-gpt-task-knowledge',version:3,caseStudies:{families:relevantJournalFamilies({styles:source.styles,purposes:source.purposes}),selectedCases:hasPresets?selectedCases.map(({id,title,method})=>({id,title,method})):[]}};
  if(hasPresets){
    imageKnowledge.abstractTemplates={note:'参考构图，不得照搬',templates:selectedTemplates};
    const refs=new Set(referenceImages.map(entry=>entry.id));
    imageKnowledge.sourceImageAudit={images:journalSourceAudit.filter(row=>refs.has(row.id))};
  }
  const compactImageStart=`拾页手帐画面图片任务｜一次完成

先读 task/context.json 与 task/GUIDE.txt；task/knowledge.json 是案例/模板辅助信息。然后${showImages?'逐件查看 materials/ 中的透明图片（WebP 或 PNG）':'依据素材名称、标签与尺寸'}。${hasPresets?' references/ 只供构图启发，不是可用素材。':''}

素材编号：${imageOrder}

最终在聊天中展示画面，并交付一张可下载 PNG。它是不可逐层编辑的画面快照，不要返回工程数据或代码。`;
  const files={
    'START_HERE.txt':strToU8(compactImageStart),
    'task/context.json':strToU8(JSON.stringify(context,null,2)),
    'task/GUIDE.txt':strToU8(brief),
    'task/knowledge.json':strToU8(JSON.stringify(imageKnowledge,null,2))
  };
  for(const entry of chosen)if(validAlias(entry.alias)&&source.materials.some(item=>item.alias===entry.alias))files[packagePreviewPath('materials',entry.alias,entry.bytes,{transparent:true})]=entry.bytes;
  if(hasPresets)for(const entry of referenceImages)files[packagePreviewPath('references',entry.id,entry.bytes)]=entry.bytes;
  const bytes=await new Promise((resolve,reject)=>zip(files,{level:4},(error,result)=>error?reject(error):resolve(result)));
  const prompt=webResultPrompt('image','file');
  return {blob:new Blob([bytes],{type:'application/zip'}),filename:'拾页-AI画面任务.zip',prompt,prompts:{file:prompt,text:null},source,mode:'image',deliveryMode:'image',previewCount:chosen.length,imageBytes:[...chosen,...(hasPresets?referenceImages:[])].reduce((total,item)=>total+item.bytes.length,0),packageBytes:bytes.length};
}
export function inspectEditableSource(text){
  if(new TextEncoder().encode(text).byteLength>8_000_000)throw Error('可编辑作品文件过大');
  const blocks=[...text.matchAll(/```(?:json|shiyeproject)?\s*([\s\S]*?)```/gi)].map(match=>match[1].trim()).filter(block=>block.includes(EDITABLE_WORK_FORMAT));
  if(blocks.length>1)throw Error('检测到多个可编辑数据块，请只复制其中一个');
  let input;try{input=JSON.parse(blocks[0]||text.trim());}catch{throw Error('可编辑作品不是有效 JSON');}
  validatePackageValue(input);
  return input;
}
export function importEditableWork(text,assets,{trustedSource=null}={}){
  const input=inspectEditableSource(text);
  if(input?.format!==EDITABLE_WORK_FORMAT||input.version!==1)throw Error('不是拾页可编辑作品文件');
  const source=input.source;
  if(!source?.capabilities?.sceneWorkbench)throw Error('请使用当前网页版创作包，最终交付原生 Scene 图层');
  return importWebScene(input,assets,{trustedSource});
}
// The ZIP is a versioned, extensible document container. Its scene remains
// individually editable; material references resolve to this account's
// original library images rather than bundling low-resolution chat previews.
export function inspectEditablePackageSource(bytes){
  const {kind,files}=readProjectPackageEntries(bytes);
  return kind==='editable'?inspectEditableSource(strFromU8(files[EDITABLE_PACKAGE_ENTRY])).source:null;
}
export function inspectOfflinePackage(bytes){
  const {kind,files}=readProjectPackageEntries(bytes,{allowTask:true});
  if(kind==='editable')return {kind,source:inspectEditableSource(strFromU8(files[EDITABLE_PACKAGE_ENTRY])).source};
  if(kind==='native')return {kind,source:null};
  const contextBytes=files['task/context.json'];
  let context;try{context=JSON.parse(strFromU8(contextBytes));}catch{throw Error('原始任务包的 task/context.json 无效');}
  validatePackageValue(context);
  if(context?.format!==OFFLINE_PACKAGE_FORMAT||context.version!==2||context.source?.taskBinding!=='local'||context.source?.packageLayout!=='compact'||!Array.isArray(context.materials)||!context.source?.materials?.length)throw Error('不是可登记的网页 AI 原始任务包');
  if(canonicalTaskSource(context.materials.map(({alias,assetID})=>({alias,assetID})))!==canonicalTaskSource(context.source.materials))throw Error('原始任务包素材映射不一致');
  return {kind,source:context.source};
}
export async function verifyOfflineTaskPackage(bytes,source){
  await assertTaskFingerprint(source);
  if(!Object.hasOwn(source,'previewHashes'))throw Error('原始任务缺少当前素材预览指纹字段');
  const expected=source.previewHashes;
  if(expected===null)return;
  if(!expected||typeof expected!=='object'||Array.isArray(expected)||Object.keys(expected).length!==source.materials.length)throw Error('原始任务的素材预览指纹不完整');
  // The archive has already passed the bounded entry/path inspection.
  readProjectPackageEntries(bytes,{allowTask:true});
  const previews=unzipSync(bytes,{filter:entry=>entry.name.startsWith('materials/')});
  for(const item of source.materials){
    const fingerprint=expected[item.alias];
    const names=['webp','png'].map(ext=>`materials/${item.alias}.${ext}`).filter(path=>previews[path]);
    if(names.length!==1)throw Error(`原始任务素材 ${item.alias} 的预览文件不唯一或缺失`);
    const image=previews[names[0]],format=previewImageFormat(image);
    if(!format||names[0]!==`materials/${item.alias}.${format.extension}`)
      throw Error(`原始任务素材 ${item.alias} 的图片内容与格式不一致`);
    if(!/^sha256:[a-f0-9]{64}$/.test(fingerprint||'')||`sha256:${await sha256Hex(image)}`!==fingerprint)
      throw Error(`原始任务素材 ${item.alias} 的预览与指纹不一致`);
  }
}
export function importEditableWorkPackage(bytes,assets,options={}){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>20_000_000)throw Error('可编辑作品包不能超过 20 MB');
  const native=importNativeProjectPackage(bytes,assets);if(native)return native;
  let files;
  try{files=unzipSync(bytes,{filter:file=>{
    if(file.name!==EDITABLE_PACKAGE_ENTRY)return false;
    if(file.originalSize>8_000_000)throw Error('作品图层数据不能超过 8 MB');
    return true;
  }});}catch(error){throw Error('无法读取可编辑作品包：'+error.message);}
  const scene=files[EDITABLE_PACKAGE_ENTRY];
  if(!scene)throw Error('作品包缺少 '+EDITABLE_PACKAGE_ENTRY);
  return importEditableWork(strFromU8(scene),assets,options);
}
export async function importEditableWorkPackageReviewed(bytes,assets,options={}){
  const imported=importEditableWorkPackage(bytes,assets,options);
  const {kind,files}=readProjectPackageEntries(bytes);
  if(kind!=='editable'||!imported.creationVerification)return imported;
  const scene=inspectEditableSource(strFromU8(files[EDITABLE_PACKAGE_ENTRY]));
  const review=await reviewExternalResultFiles(files,scene);
  imported.creationVerification={...imported.creationVerification,...review};
  return imported;
}

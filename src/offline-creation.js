import {creationSourceForProject} from './creation-document.js';
import {creationMethod} from './creation-methods.js';
import {imageWorkflowRequest,imageWorkflowGuide} from './image-workflow.js';
import {webSceneContract,webSceneDocument,importWebScene} from './web-scene-workbench.js';
import {createV3PackageFiles} from './v3-package.js';
import {webArtDirection} from './web-creation-guide.js';
import {creationMaterialContext} from './creation-guidance.js';
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
const projectMode=(p,settings)=>p.creationMode||settings.creationMode||'edit';

export function createEditablePackageGuide(source,selected,settings={}){
 const materialDirection=!selected.length
  ?'本次没有实体素材：直接用文字、手绘、图形、表格或图案完成整页。先确定想表达的内容与视觉主块，再形成有节奏的大小和疏密关系；无需查看空素材总览，不虚构照片或素材引用，不把图形堆成模板占位。'
  :creationMaterialContext(selected).mainCount<=3
  ?'本次素材较少：看 assets/size-map.jpg 核对实物大小。辨认哪一件能承载书写、哪一件做主角；画布空白本身也是手帐纸，可以直接写随想与旁注。让可读的正文、短注或数字图形与素材产生关系，避免三件物品各占一格、旁边只写几句解释。不要放大实物填空，也不要虚构经历。'
  :'本次素材较多：看 assets/size-map.jpg 核对相对实物大小。先分清印刷标题、主角、书写面、底纸与小件，组成少数有内在关系的局部，而非等大卡片陈列。画布空白本身也能直接书写，不必把全部正文塞进唯一一张卡片。可让人物或小贴纸压住纸边、让正文沿实物边缘展开；露出有用轮廓，避免多件同心堆叠。';
 // START_HERE and REVIEW own the reusable composition workflow. Keep this
 // per-task guide short so the model can reach the actual materials sooner.
 const textDirection=source.contentPolicy==='visual'||source.textMode==='none'?'本次不新增文字。':source.textMode==='requested'&&!source.userText?'没有明确文字要求时不主动配文。':source.textMode==='rich'?'本次可以写展开的随想：在真实书写空间内推进一个具体念头，再用短注回应素材细节；不靠口号或重复句子凑满。':source.textMode==='minimal'?'本次文字精炼，但图文关系仍须完成。':'新增文字长短随真实书写空间和内容而定。';
 const pageDirection=source.mode==='spread'?'双页先按 TASK.page.regions 的毫米区域组织，主体、标题和正文默认避开中缝两侧约 5 mm（窄纸按比例缩小），用隔缝配色/图案呼应；大素材裁取或换朝向，不缩放实体。分别检查：每页都有主块、可读内容或明确的视觉回应；两页可一重图一重字，但不要把某页的空洞算作另一页的留白。':'缩看整页，再放大检查图文交界和细节。';
 return ['materials.selection 标出取材优先级：required 必须可见，preferred 优先考虑，available 按需取用；后两者可以不选，记录 material.decision 即可。素材篮不是必须全件完整铺开的清单。',selected.some(item=>item.usageStatus==='preset')?'本次含预设素材：它们在素材库中与其他材料并列，TASK 中标记 usageStatus=preset；可重复使用，但仍按设计尺寸摆放。根据实际图文关系选择胶带、贴纸或印章，不要为填满画面机械地全部加入。':null,creativeContentBrief({policy:source.contentPolicy,userText:source.userText,providedFacts:source.providedFacts,topic:source.intent,purposes:source.purposes}),webArtDirection(source,selected),materialDirection,textDirection,pageDirection,'先看实物轮廓、印刷字和可写处，再让主块、文字与图形共同决定排版。只有结构难以取舍时才比较候选，不为比较而重写整份 Scene。只写 work/commands.json，局部修订继续用下一批 Command；对当前 Scene 真实预览。技术通过与视觉完成分开判断，具体诊断见 design/REVIEW.md；高级工艺按需 describe，不预读完整 Schema。',settings.customLayoutPrompt||'',settings.includeStructureReference===false?'':structureReferenceGuide].filter(Boolean).join('\n\n');
}
// Alias shortening happens before freezing/hashing the task. Persistent asset
// IDs never change, and images and source references share the same mapping.
export async function createOfflineHandoff({project:p,assets,aliases,previews=[],settings={},referencePreview=null}){
 const creationMode=creationMethod(projectMode(p,settings));
 {
  const entries=Object.entries(aliases);
  if(entries.some(([alias])=>!validAlias(alias)))throw Error('素材篮中有无效素材编号');
  const short=new Map(entries.map(([alias],index)=>[alias,'m'+(index+1)]));
  aliases=Object.fromEntries(entries.map(([alias,id])=>[short.get(alias),id]));
  previews=previews.map(entry=>({...entry,alias:short.get(entry.alias)||entry.alias}));
 }
 const source=creationSourceForProject(p,aliases);source.creationMode=creationMode;source.taskBinding='local';source.textMode=source.contentPolicy==='visual'?'none':settings.textMode||'automatic';
 const selected=source.materials.map(({alias,assetID})=>{
  const asset=assets.find(item=>item.id===assetID);if(!asset||!validAlias(alias))throw Error('素材篮中有无效素材编号');
  const hints=value=>Array.isArray(value)?value.filter(item=>typeof item==='string'&&item.trim()).slice(0,8).map(item=>item.trim().slice(0,40)):[];
  return {alias,assetID,title:asset.title,kind:asset.kind,role:asset.role,journalRoles:classifyJournalMaterial(asset),physicalWidthMM:asset.physicalWidthMM,physicalHeightMM:asset.physicalHeightMM,...(asset.isCreativePreset?{usageStatus:'preset'}:{}),continuousTape:asset.kind==='tape',tape:asset.kind==='tape'?{axis:tapeDimensions(asset).axis,widthMM:tapeDimensions(asset).widthMM,sourceLengthMM:tapeDimensions(asset).lengthMM,repeatRangeMM:tapeRepeatRange(asset),flatCrop:asset.tapeFlatCrop??null,textureModes:['sample',...(tapeRepeatRange(asset)?['repeat']:[]),'stretch'],capStyles:['square','angled','torn']}:null,tags:hints(asset.tags),contentTags:hints(asset.contentTags),styleTags:hints(asset.styleTags),semanticColorNames:hints(asset.semanticColorNames),placementHints:hints(asset.placementHints)};
 });
 if(!selected.length&&creationMode!=='edit')throw Error('请先选择素材');
 const showImages=settings.includeThumbnails!==false,chosen=showImages?previews:[];
 if(showImages&&selected.some(item=>!chosen.some(preview=>preview.alias===item.alias&&preview.bytes instanceof Uint8Array&&preview.bytes.length)))throw Error('创作包缺少素材预览，未导出不完整文件');
 if(creationMode!=='edit'&&!showImages)throw Error('真实素材生图需要素材图片；没有跳过引用图。');
 if(referencePreview){if(creationMode!=='hybrid'||!(referencePreview instanceof Uint8Array))throw Error('只有混合创作可附带参考图');const format=previewImageFormat(referencePreview);if(!format||referencePreview.length>40000000)throw Error('参考图格式或大小无效');source.referenceImage={image:'reference/draft.'+format.extension,sha256:'sha256:'+await sha256Hex(referencePreview),role:'generated-visual-reference-not-source'};}
 const {offlineValidateSource}=await import('./generated/offline-validate-source.js'),{offlineGlyphSource}=await import('./generated/offline-glyph-source.js'),mode=creationMode;
 source.capabilities=creationMode==='draw'?{sceneWorkbench:false,imageGeneration:'host-required',sourceFidelity:'reference-only'}:{sceneWorkbench:true,cropPx:false,craftPlan:true,multimodalVision:showImages,twoHoleWeave:true,editableTapeRibbon:true,canonicalNodePreview:true,validateOffline:true,previewOffline:'node-canvas',graphics:'local-read-only'};
 source.packageLayout='v3';source.schemaHash=schemaFingerprint(webSceneContract);source.planSchemaHash=schemaFingerprint(toolContracts.apply_craft_plan);
 freezeCraftTask(source,p.drafts[0],assets);
 source.previewHashes=showImages?Object.fromEntries(await Promise.all(chosen.map(async entry=>[entry.alias,`sha256:${await sha256Hex(entry.bytes)}`]))):null;
 source.taskHash=await taskFingerprint(source);
 const work=webSceneDocument(source,source.baseDraft,p.title);
 const guide=createEditablePackageGuide(source,selected,settings);
 const files=await createV3PackageFiles({source,selected,chosen,work,guide,runtime:offlineValidateSource,glyph:offlineGlyphSource});
 if(creationMode!=='edit'){
  const task=JSON.parse(strFromU8(files['TASK.json']));task.creationMode=creationMode;task.imageRequestRef='image-request.json';
  files['image-request.json']=strToU8(JSON.stringify(imageWorkflowRequest({mode:creationMode,source,materials:task.materials,reference:source.referenceImage||null}),null,2));
  files['design/IMAGE_MODE.md']=strToU8(imageWorkflowGuide+'\n## 本次生图要求\n'+imagePrompt({project:p,draft:p.drafts[0],assets,ids:selected.map(m=>m.assetID),theme:p.intent,includeImages:true,textMode:source.textMode,requireAll:settings.requireAllCandidates!==false}));
  if(referencePreview)files[source.referenceImage.image]=referencePreview;
  if(creationMode==='draw'){
   for(const key of Object.keys(files))if(!key.startsWith('assets/')&&!['TASK.json','image-request.json','design/IMAGE_MODE.md'].includes(key))delete files[key];
   files['START_HERE.md']=strToU8('# 拾页 · 纯绘画\n读 TASK.json、image-request.json 和 design/IMAGE_MODE.md，查看 assets/ 原图。由宿主图像模型创作完整 PNG，交付图像快照；不是可编辑 Scene，不调用 apply/pack。');
  }else files['START_HERE.md']=strToU8('# 本次是混合创作\n先读 design/IMAGE_MODE.md：先生成或查看参考成图，再按下面的统一 Command 流程重建独立可编辑候选。不要用生图替代 Scene 的 preview。\n\n'+strFromU8(files['START_HERE.md']));
  files['TASK.json']=strToU8(JSON.stringify(task,null,2));
 }
 const bytes=zipSync(files,{level:4}),prompts={file:webResultPrompt(mode,'file'),text:mode==='draw'?null:webResultPrompt(mode,'text')};
 return {blob:new Blob([bytes],{type:'application/zip'}),filename:'拾页-GPT创作任务.zip',prompt:prompts.file,prompts,source,mode,deliveryMode:mode==='draw'?'image':'tools',previewCount:chosen.length,imageBytes:chosen.reduce((total,item)=>total+item.bytes.length,0),packageBytes:bytes.length};
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
 if(context?.format!==OFFLINE_PACKAGE_FORMAT||context.version!==3||context.sourceContext?.taskBinding!=='local'||context.sourceContext?.packageLayout!=='v3'||!Array.isArray(context.materials)||!Array.isArray(context.sourceContext?.materials))throw Error('不是可登记的网页 AI 原始任务包');
 if(canonicalTaskSource(context.materials.map(({alias,assetID})=>({alias,assetID})))!==canonicalTaskSource(context.sourceContext.materials))throw Error('原始任务包素材映射不一致');return {kind,source:context.sourceContext};
}
export async function verifyOfflineTaskPackage(bytes,source){
 await assertTaskFingerprint(source);
 if(!Object.hasOwn(source,'previewHashes'))throw Error('原始任务缺少当前素材预览指纹字段');
 const expected=source.previewHashes;if(expected===null)return;
 if(!expected||typeof expected!=='object'||Array.isArray(expected)||Object.keys(expected).length!==source.materials.length)throw Error('原始任务的素材预览指纹不完整');
 readProjectPackageEntries(bytes,{allowTask:true});const previews=unzipSync(bytes,{filter:entry=>entry.name.startsWith('assets/')||entry.name===source.referenceImage?.image});
 if(source.referenceImage){const reference=previews[source.referenceImage.image];if(!reference||!previewImageFormat(reference)||'sha256:'+await sha256Hex(reference)!==source.referenceImage.sha256)throw Error('混合创作参考图缺失或指纹不一致');}
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

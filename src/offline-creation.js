import {previewImageFormat} from './offline-preview.js';
import {webResultPrompt} from './creation-methods.js';
import {offlineCreationPlanningData,offlineCreationWorkflowText,offlineVisualReviewChecklist} from './offline-creation-workflow.js';
import {stabilizeImportedCraftScene} from './craft-import-identity.js';
import {multimodalCraftGuide} from './craft-vision.js';
import {freezeCraftTask,validateCraftTask,inheritCreationBrief,craftTaskInstructions} from './craft-task.js';
import {validateNativeDraft} from './native-project-package.js';
import {zip,unzipSync,strToU8,strFromU8} from 'fflate';
import {project} from './domain.js';
import {applyToolCalls} from './creative.js';
import {toolContracts,offlinePlanContract,directPageContract,directPageToTools,offlineContract,schemaFingerprint,validateValue} from './creative-contract.js';
import {visualStyleBrief} from './creative-style-brief.js';
import {creativeDesignGuide,purposeMethod} from './creative-design-guide.js';
import {validMaterialAlias} from './material-alias.js';
import {importNativeProjectPackage,validatePackageValue} from './native-project-package.js';
import {readProjectPackageEntries} from './project-package-archive.js';
import {canonicalTaskSource} from './task-source.js';
import {sha256Hex,taskFingerprint,assertTaskFingerprint,assertTaskFingerprintSync} from './task-fingerprint.js';
import {reviewExternalResultFiles} from './offline-result-review.js';
import {creativeContentBrief} from './creative-content-brief.js';
import {creativePageBrief} from './creative-page-brief.js';
import {imagePrompt} from './ai-image-generation.js';
import {classifyJournalMaterial,journalMaterialRoles,relevantJournalFamilies} from './journal-case-study.js';
import {journalReferenceGuide,selectJournalReferenceCases} from './journal-reference-catalog.js';
import {journalAbstractTemplateGuide,selectJournalAbstractTemplates} from './journal-abstract-templates.js';
import {journalSourceAudit,journalVerifiedPairs} from './journal-source-audit.js';
import {paperDimensions} from './paper-sizes.js';

export const OFFLINE_PACKAGE_FORMAT='shiye-gpt-creation-package';
function packagePreviewPath(folder,name,bytes,{transparent=false}={}){
  const format=previewImageFormat(bytes);
  if(!format||(transparent&&format.extension==='jpg'))
    throw Error('创作预览格式无效；真实素材必须保留透明通道');
  return `${folder}/${name}.${format.extension}`;
}

export const EDITABLE_WORK_FORMAT='shiye-editable-project';
export const EDITABLE_PACKAGE_ENTRY='project.shiyeproject.json';
const allowedTools=new Set(['apply_craft_plan','compose_page','place_materials','edit_materials','upsert_materials','move_elements','arrange_elements','fit_text_to','upsert_primitives','upsert_text','style_elements','group_elements','ungroup_elements','delete_elements','set_paper','finish_design']);
const compositionIdeas=source=>relevantJournalFamilies(source).map(({name,purposes,method,materials})=>({name,use:purposes.join('、'),plan:method,materialRoles:materials}));
const caseStudies=(source,selected=[])=>({note:'包内仅选与本次风格、用途和素材相关的版式参考：原创重构家族案例及已匹配的私有教程原图（如果可读取）。这些参考图不是可用素材，图中文字不可当正文。模板与成品的配对证据见 abstract-templates.json 和 source-image-audit.json。',families:relevantJournalFamilies(source),selectedCases:selectJournalReferenceCases({styles:source.styles,purposes:source.purposes,materials:selected}).map(({id,title,method,copy})=>({id,title,method,copy})),materialRoles:journalMaterialRoles});
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
  return structuredClone({bundleId:crypto.randomUUID(),title:p.title,mode:d.pageMode,ratio:d.pageRatio,styles:p.styles||[d.style],purposes:p.purposes||[p.purpose||'日常记录'],intent:p.intent||'',contentPolicy:p.contentPolicy||'documentary',textPresentation:p.textPresentation||'mixed',userText:p.userText||'',providedFacts:p.providedFacts||'',processing:p.processing||'保留完整',requiredAssetIDs:p.requiredAssetIDs||[],materialPriority:{required:priority.required||[],preferred:priority.preferred||[],available:priority.available||[]},materialUseHints:p.materialUseHints||{},materialUseRequired:p.materialUseRequired||{},assetProcessing:p.assetProcessing||{},materials:Object.entries(aliases).map(([alias,assetID])=>({alias,assetID}))});
}
// The upload is a task package, not a source archive. Keep the chat prompt
// short and put exact context, contracts, examples and separate images inside.
export async function createOfflineHandoff({project:p,assets,aliases,previews=[],settings={},referenceImages=[],userTemplates=[]}){
  const source=sourceFor(p,aliases);source.taskBinding='local';source.textMode=source.contentPolicy==='visual'?'none':settings.textMode||'automatic';const selected=source.materials.map(({alias,assetID})=>{
    const asset=assets.find(item=>item.id===assetID);
    if(!asset||!validAlias(alias))throw Error('素材篮中有无效素材编号');
    return {alias,assetID,title:asset.title,kind:asset.kind,role:asset.role,journalRoles:classifyJournalMaterial(asset),physicalWidthMM:asset.physicalWidthMM,physicalHeightMM:asset.physicalHeightMM,quantity:asset.kind==='tape'?null:asset.supply?.quantity??1,continuousTape:asset.kind==='tape',tags:asset.tags||[]};
  });
  if(!selected.length)throw Error('请先选择素材');
  const showImages=settings.includeThumbnails!==false;
  const chosen=showImages?previews:[];
  if(showImages&&selected.some(item=>!chosen.some(preview=>preview.alias===item.alias&&preview.bytes instanceof Uint8Array&&preview.bytes.length)))throw Error('创作包缺少素材预览，未导出不完整文件');
  for(const entry of chosen)packagePreviewPath('materials',entry.alias,entry.bytes,{transparent:true});
  if(settings.deliveryMode==='image')return createOfflineImageHandoff({source,project:p,assets,selected,chosen,settings,referenceImages,showImages,userTemplates});
  const {offlineValidateSource}=await import('./generated/offline-validate-source.js');
  const {offlineGlyphSource}=await import('./generated/offline-glyph-source.js');
  const mode=settings.generationMode==='direct'?'direct':'agent';
  source.capabilities={cropPx:false,craftPlan:mode==='agent',multimodalVision:showImages,twoHoleWeave:mode==='agent',canonicalBrowserPreview:true,validateOffline:true,previewOffline:'approximate-svg'};
  source.packageLayout='compact';
  const exportedContract=offlineContract(mode,{cropPx:false});
  source.schemaHash=schemaFingerprint(exportedContract);source.planSchemaHash=schemaFingerprint(toolContracts.apply_craft_plan);
  freezeCraftTask(source,p.drafts[0],assets);
  source.previewHashes=showImages?Object.fromEntries(await Promise.all(chosen.map(async entry=>[entry.alias,`sha256:${await sha256Hex(entry.bytes)}`]))):null;
  source.taskHash=await taskFingerprint(source);
  const context={format:OFFLINE_PACKAGE_FORMAT,version:2,source,materials:selected.map(item=>({...item,preview:showImages?packagePreviewPath('materials',item.alias,chosen.find(entry=>entry.alias===item.alias)?.bytes,{transparent:true}):null}))};
  const envelope={format:EDITABLE_WORK_FORMAT,version:1,source,title:'新的手帐'};
  const directExample={...envelope,page:{version:2,style:'自由构图',intent:null,
    paper:{color:'#fcfaf0',pattern:'plain'},
    layers:[
      {type:'material',id:'hero',asset:selected[0].alias,piece:'hero',unit:0,
        operations:[{op:'whole'}],placement:{x:.48,y:.42,rotation:-6,z:10}},
      {type:'text',id:'title',content:'这一页的主题',font_style:'serif',
        x:.5,y:.14,width:.76,height:.09,font_size:30,color:'#30463d'},
      {type:'text',id:'body',content:'与这件素材有关的真实观察。',
        font_style:'sans',x:.5,y:.8,width:.76,height:.11,font_size:19,color:'#30463d'}
    ]}};
  const layeredGraphics=[
    {key:'note-base',kind:'roundedRectangle',x:.53,y:.74,width:.72,height:.19,fill:'#f5eccb',stroke:null,z:40},
    {key:'marker',kind:'rectangle',x:.5,y:.745,width:.38,height:.022,fill:'#f8df6a',stroke:null,opacity:.68,z:50},
    {key:'small-star',kind:'star',x:.86,y:.6,width:.035,height:.035,fill:'#e5ac52',stroke:null,z:60}
  ];
  const layeredTexts=[
    {content:'这一页的主题',font_style:'serif',x:.5,y:.13,width:.7,height:.09,font_size:30,color:'#30463d',role:'title',z:900},
    {content:'和这件素材有关的一句话，\n可放在它的旁边。',font_style:'sans',x:.77,y:.44,width:.26,height:.10,font_size:18,color:'#30463d',role:'caption',line_spacing:3,z:900},
    {content:'把值得记住的小细节写在这里，\n让这张便签与附近的素材互相回应。',font_style:'sans',x:.53,y:.74,width:.62,height:.14,font_size:19,color:'#30463d',role:'body',line_spacing:4,z:900}
  ];
  directExample.page.layers.push(...layeredGraphics.map(shape=>({type:'shape',id:shape.key,...shape})));
  directExample.page.layers.push({type:'ink',id:'hand-mark',points:[{x:.20,y:.63},{x:.24,y:.62},{x:.29,y:.64},{x:.34,y:.62}],width:3,color:'#5278a7',pen_style:'brush',opacity:.8});
  const textRule={none:'不生成文字',requested:'仅按明确要求配文',minimal:'少量可编辑文字',rich:'丰富且可读的可编辑文字',automatic:'按用途生成可编辑文字'}[source.textMode]||'按用途生成可编辑文字';
  const contentBrief=creativeContentBrief({policy:source.contentPolicy,userText:source.userText,providedFacts:source.providedFacts,topic:source.intent,purposes:source.purposes});
  const task=[`内容要求：先读 CONTENT_BRIEF.txt；正文按页面用途写，不把创作讲解写入画面。`,`风格：${source.styles.map(name=>`${name}（${visualStyleBrief(name)}）`).join('；')||'不预设，由素材和主题决定'}`,`用途：${source.purposes.join('、')||'不预设，由主题决定'}`,`纸张：${source.ratio.toUpperCase()} · ${source.mode==='spread'?'双页':'单页'}`,`双页构图偏好：${source.mode==='spread'?'画布中线 x=0.5 是装订中缝；尽量让每一件实体素材完整留在左页或右页，避免横跨中缝。不是硬性限制，必要时可以跨页，数字文字与图形可自由跨页。':'单页没有中缝限制。'}`,`加工：${source.processing}`,`文字：${textRule}`].join('\n');
  const materialRules=selected.map(item=>`${item.alias} ${item.title}｜${source.materialPriority.required.includes(item.assetID)?'必须使用':source.materialPriority.available.includes(item.assetID)?'可以使用（仅备选）':'优先使用'}｜${item.kind}｜${item.physicalWidthMM||'?'}×${item.physicalHeightMM||'?'} mm｜${item.continuousTape?'连续胶带':`库存 ${item.quantity}`}｜${source.assetProcessing[item.assetID]||source.processing}｜${source.materialUseHints[item.assetID]||'自由选择用法'}${source.materialUseRequired[item.assetID]?'（必须体现该用法）':''}`).join('\n');
  const densePage=source.purposes[0]!=='主题封面'&&source.styles[0]!=='极简留白';
  const purposeNotes=source.purposes.map(name=>`${name}：${purposeMethod(name)}`).join('；');
  const modeRules=mode==='direct'?'直接返回 page.version=2 的单棵 layers 图层树，不返回 tools；materials、shape、text、ink 与 group 都是 layers 节点，按树顺序叠放。素材经 operations 裁切、挖窗，实体尺寸、库存由拾页校验；不能输出并列的旧图层数组。':'返回 tools 操作数组，先用 compose_page，最后以 finish_design 结束；线条、边框、色块、多色矢量等放入 graphics 或 upsert_primitives；裁片后可用 edit_materials 的 mask、diagonal 和 window 加工，开窗是透明镂空而非白色覆盖；工具参数见 contract.json。';
  const hasPresets=settings.sendPresetReferences===true;
  const selectedCases=selectJournalReferenceCases({styles:source.styles,purposes:source.purposes,materials:selected});
  const selectedTemplates=selectJournalAbstractTemplates(selectedCases,{styles:source.styles,purposes:source.purposes,materials:selected,userTemplates});
  if(hasPresets)validateTemplateReferences(selectedCases,selectedTemplates,referenceImages);
  if(hasPresets)for(const entry of referenceImages)packagePreviewPath('references',entry.id,entry.bytes);
  const example=mode==='direct'?directExample:{...envelope,tools:[{name:'compose_page',arguments:{materials:[{asset:selected[0].alias,piece:'主素材',unit:0,x:.5,y:.42}],graphics:[],texts:[{key:'title',content:'这一页的主题',width:.8,x:.5,y:.12,font_size:44,color:'#30463d',alignment:'center',role:'title'},{key:'body-1',content:'第一段可编辑正文。',width:.75,x:.5,y:.7,font_size:24,color:'#30463d',role:'body'},{key:'body-2',content:'第二段可编辑正文。',width:.75,x:.5,y:.82,font_size:24,color:'#30463d',role:'body'}],paper:{color:'#fcfaf0',pattern:'plain'}}},{name:'finish_design',arguments:{summary:'完成可编辑手帐'}}]};
  if(mode!=='direct'){
    example.tools[0].arguments.graphics=layeredGraphics;
    example.tools[0].arguments.texts=layeredTexts.map((item,index)=>({...item,key:'example-text-'+index}));
  }
  const runtimeCapabilities={schemaHash:source.schemaHash,sourcePixelCoordinates:false,cropPx:false,previewOnly:showImages,runtime:{validate:'node20',render:'browser-html-manual',preview:'approximate-svg',browserRender:'shiye-canvas-v2',pack:'node20',visualReview:'manual-required'},craft:{plan:mode==='agent',observations:mode==='agent'&&showImages,twoHoleWeave:mode==='agent',glyphGeometry:'local-font-required'}};
  const knowledge={format:'shiye-gpt-task-knowledge',version:3,capabilities:runtimeCapabilities,
    regions:source.sourceSnapshots.map(snapshot=>({assetID:snapshot.assetID,sourceRevision:snapshot.sourceRevision,anatomy:snapshot.anatomy})),
    compositionIdeas:compositionIdeas(source).slice(0,3),
    caseStudies:{families:relevantJournalFamilies({styles:source.styles,purposes:source.purposes}),selectedCases:hasPresets?selectedCases.map(({id,title,method})=>({id,title,method})):[]}
  };
  if(hasPresets){
    knowledge.abstractTemplates={note:'只借鉴方法，不能照搬素材或坐标',templates:selectedTemplates};
    // Do not send the full 70-image tutorial audit when only a few matched
    // references are in this task. Never claim an unverified cross-image pair.
    const chosenReferences=new Set(referenceImages.map(entry=>entry.id));
    knowledge.sourceImageAudit={images:journalSourceAudit.filter(row=>chosenReferences.has(row.id)),verifiedCrossImagePairs:journalVerifiedPairs.filter(row=>chosenReferences.has(row.caseId)&&chosenReferences.has(row.templateId))};
  }
  const workflowText=offlineCreationWorkflowText({mode,hasImages:showImages});
  const materialPlanning=offlineCreationPlanningData(source,selected,{mode,hasImages:showImages});
  const pageBrief=creativePageBrief({styles:source.styles,purposes:source.purposes,textMode:source.textMode,
    contentPolicy:source.contentPolicy,textPresentation:source.textPresentation,userText:source.userText,
    theme:source.intent,pageMode:source.mode});
  const compactGuide=[
    '【内容边界】',contentBrief,
    '【单双页构图与正文】',pageBrief,
    '【创作原则】','先观察真实图案与物理尺寸，再建立主次、叠压、局部加工与阅读路径；拒绝把所有素材平铺成网格。标题、正文和手写装饰需要有实际内容；可保留有意义的留白，素材可少用但不可漏掉 required。参考图不是实体材料，也不是必须复刻的模板。',
    '【统一 Scene 的实体扩展】','图层可使用 vector_mask 表达 0–1 外轮廓与镂空孔洞；blend_mode=multiply 仅在透明纸、胶带或印色自然叠加时使用。相关文字、矢量和实体片段可以 代理工具 group_elements 或直接模式 page.layers 中的 group 节点 一起移动；编组不能缩放实体。所有编辑仍保存为拾页相同的 Draft 场景，不把真实图像烘焙成不可编辑的效果图。',
    '【文字方式】',source.textPresentation==='handwritten'?'自由手写优先：用 page.layers 的 ink 图层或工艺计划 ink 绘制短句、标记与线条；长段可用可编辑手写风格文字，避免伪字迹。':source.textPresentation==='type'?'排版文字优先：文字保持独立可编辑，选好字体、行距与层次。':'混合编排：排版正文结合少量可编辑手写笔迹。',
    '【编辑合同】',mode==='agent'?'只输出 tools；可使用 apply_craft_plan 做复杂取材与穿插；确切参数以 schema/output.json 为准。':'只输出 page.version=2 且仅含递归 page.layers 图层树；material.operations 按物理裁切协议，shape/text/ink 作为独立可编辑叶图层。禁止输出旧版 items/graphics/text_blocks/ink_strokes 并列数组。'
  ].join('\n\n');
  const compactStart=`拾页 GPT 创作任务 · 先读这一页
请创作一幅独立、可编辑的手帐作品，不要把整页烘焙成图片。按以下优先级工作：
1. 先看 task/context.json 与 materials/ 真实素材。source、尺寸、库存、required 必须保持；素材标题不是图像观察证据。
2. 阅读 task/WORKFLOW.txt 的创作步骤、task/GUIDE.txt 的用户内容边界。可参考 task/material-planning.json 的问题，不把它的假设当事实。
3. 内部比较至少两种素材组合方向，选最自然的一种；有选择地裁切、叠压、穿插和手写，不照抄 references/ 的版式。
4. 合法输出合同是 schema/output.json。当前模式：${mode==='direct'?'page（直接排版）':'tools（调用工具）'}，不能混用。${mode==='direct'?'高级 observations/weaves 不可混入直接排版。':'只包含本合同的 tools；严禁额外顶层 page。'}examples/project.shiyeproject.json 仅展示字段，不能复制正文或坐标。高级工艺参数仅在 tools 模式阅读 schema/craft-plan.json。
5. 将完整结果保存为 project.shiyeproject.json，运行 node runtime/preview.cjs 生成 output/画面预览.html；必须使用实际浏览器打开它、等待 SHIYE_RENDER_READY，再通过页面“下载 PNG”按钮或 Canvas 截图取得同一 Scene 的 PNG，并在聊天中实际展示这张图片，然后交付 JSON。不能用 output/构图预览.svg 或另生成的画作冒充 Canvas 预览；如果浏览器不可用，明确写未能生成真实 Canvas 预览，不要声称已经展示。
6. 若用户要求看预览，先在聊天中展示同源 Canvas PNG，再按用户指定格式交付完整 JSON（可用 JSON 代码围栏）；若用户明确限定仅有一个 JSON 代码块且不允许附加图，则遵守该限制，并说明无法显示图像时不能冒充已预览。保留 source 原样，只更改 title 与 ${mode==='direct'?'page':'tools'}。

【本次主题、要求和内容】
${source.intent||'未指定：根据素材自由创作'}
风格：${source.styles.join('、')||'自由发挥'}；用途：${source.purposes.join('、')||'日常记录'}。
纸张：${source.ratio} ${source.mode==='spread'?'双页':'单页'}；文字内容：${source.contentPolicy}；表现：${source.textPresentation||'mixed'}。
${settings.customLayoutPrompt?'补充要求：'+settings.customLayoutPrompt:''}
${showImages?'素材图以 materials/ 为准，保留透明通道。':'本包无素材图片，切勿猜测细节。'}
${hasPresets?'references/ 只作为灵感来源，不是可用库存。':''}
`;
  const files={
    'START_HERE.txt':strToU8(compactStart),
    'task/context.json':strToU8(JSON.stringify(context,null,2)),
    'task/WORKFLOW.txt':strToU8(workflowText),
    'task/material-planning.json':strToU8(JSON.stringify(materialPlanning,null,2)),
    'task/VISUAL_REVIEW.txt':strToU8(offlineVisualReviewChecklist),
    'task/GUIDE.txt':strToU8(compactGuide),
    'task/knowledge.json':strToU8(JSON.stringify(knowledge,null,2)),
    'schema/output.json':strToU8(JSON.stringify(exportedContract,null,2)),
    'schema/craft-plan.json':strToU8(JSON.stringify(toolContracts.apply_craft_plan,null,2)),
    'examples/project.shiyeproject.json':strToU8(JSON.stringify(example,null,2)),
    'runtime/glyphs.cjs':strToU8(offlineGlyphSource),
    'runtime/validate.cjs':strToU8(offlineValidateSource),
    'runtime/preview.cjs':strToU8(`process.argv[2]='preview';require('./validate.cjs');
`),
    'runtime/README.txt':strToU8('把完整 JSON 保存为任务根目录 project.shiyeproject.json。Node.js 20+：validate.cjs 校验；preview.cjs 生成 output/构图预览.svg 与 output/画面预览.html；用真实浏览器打开 HTML，等待 SHIYE_RENDER_READY，从实际 Canvas 下载 PNG，并把图片展示给用户；如无浏览器须明确说明未验收。最终将 project.shiyeproject.json 单文件交回拾页，不要交付 ZIP 工程包。运行时只读取 task/context.json。glyphs.cjs 只从本地已有字体生成数值轮廓，不携带字体文件。 中文 SVG/HTML 预览依赖系统可用中文字体（例如 Noto/PingFang/微软雅黑）；如果看到方框字，请安装中文字体并重新渲染或在拾页中打开可编辑作品，不能把方框预览视为最终效果。')
  };
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
  if(text.length>2_000_000)throw Error('可编辑作品文件过大');
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
  if(!source||typeof source.bundleId!=='string'||!Array.isArray(source.materials)||!source.materials.length||source.materials.length>100)throw Error('创作包来源无效');
  if(source.taskBinding!=='local'||source.packageLayout!=='compact')throw Error('创作包来源格式无效');
  assertTaskFingerprintSync(source);
  if(trustedSource&&canonicalTaskSource(source)!==canonicalTaskSource(trustedSource))throw Error('作品来源与所选原始任务不一致');
  if(!['single','spread'].includes(source.mode)||!paperDimensions(source.ratio))throw Error('纸张规格无效');
  const direct=input.page!==undefined,planned=input.plan!==undefined;
  if([input.page,input.plan,input.tools].filter(value=>value!==undefined).length!==1)throw Error('作品只能包含 page、plan、tools 中的一种入口');
  const tools=planned?[{name:'apply_craft_plan',arguments:input.plan}]:direct?directPageToTools(input.page):input.tools;
  const standalonePlan=Array.isArray(tools)&&tools.length===1&&tools[0]?.name==='apply_craft_plan';
  if(!Array.isArray(tools)||!tools.length||tools.length>12||(direct?tools.length!==1||tools[0].name!=='compose_direct_page':!standalonePlan&&(tools.at(-1)?.name!=='finish_design'||!tools.some(t=>t.name==='compose_page'||t.name==='apply_craft_plan'))))throw Error('作品需要完整页面、完整工艺计划，或包含 compose_page 并以 finish_design 结束的有效工具数组');
  const baseDraft=validateCraftTask(source,assets);
  if(!direct&&tools.some(t=>!allowedTools.has(t?.name)))throw Error('作品包含不支持的创作操作');
  if(planned){
    if(schemaFingerprint(offlinePlanContract())!==source.planSchemaHash)throw Error('工艺计划合同版本不匹配');
    validateValue(input.plan,offlinePlanContract(),'$.plan');
  }else{
    if(!source.schemaHash)throw Error('创作任务缺少当前输出合同指纹');
    const contract=offlineContract(direct?'direct':'agent',{cropPx:false});
    if(schemaFingerprint(contract)!==source.schemaHash)throw Error('创作包合同版本不匹配');
    if(direct)validateValue(input.page,contract,'$.page');
    else for(const [index,tool] of tools.entries())validateValue(tool.arguments,contract[tool.name],`$.tools[${index}].arguments`);
  }
  const aliases={},seen=new Set();for(const m of source.materials){if(!validAlias(m.alias)||typeof m.assetID!=='string'||seen.has(m.alias)||!assets.some(a=>a.id===m.assetID))throw Error('作品引用了不存在或重复的素材');seen.add(m.alias);aliases[m.alias]=m.assetID;}
  if(!Array.isArray(source.requiredAssetIDs)||source.requiredAssetIDs.some(id=>!Object.values(aliases).includes(id)))throw Error('必用素材不在创作包中');
  const sourcePriority=source.materialPriority,allowedIDs=new Set(Object.values(aliases));
  if(sourcePriority&&['required','preferred','available'].some(key=>!Array.isArray(sourcePriority[key])||sourcePriority[key].some(id=>!allowedIDs.has(id))))throw Error('素材优先级引用了创作包之外的素材');
  const title=typeof input.title==='string'&&input.title.trim()?input.title.trim().slice(0,80):'导入的可编辑作品';
  const p=project(title,{mode:source.mode,ratio:source.ratio,style:Array.isArray(source.styles)?source.styles[0]:'韩系清新'});
  const selectedAssets=assets.filter(a=>Object.values(aliases).includes(a.id));
  if(baseDraft){validateNativeDraft(baseDraft,new Set(selectedAssets.map(a=>a.id)));p.drafts[0]=baseDraft;p.activeDraftID=baseDraft.id;}
  const result=applyToolCalls({tools},p.drafts[0],selectedAssets,aliases,{visualAssetIDs:source.materials.filter(m=>source.previewHashes?.[m.alias]).map(m=>m.assetID),requiredAssetIDs:source.requiredAssetIDs,processing:source.processing||'保留完整',textMode:source.textMode||'automatic',materialUseHints:source.materialUseHints||{},materialUseRequired:source.materialUseRequired||{},assetProcessing:source.assetProcessing||{},pagePurposes:source.purposes||['日常记录'],allowNoText:source.textMode==='none'||source.purposes?.every(x=>x==='主题封面')});
  const error=result.results.find(x=>!x.ok);if(error)throw Error(`${error.name}：${error.detail}`);
  if(!result.committed||result.draft.agentRun?.status!=='finished')throw Error('作品没有完成可编辑页面校验');
  stabilizeImportedCraftScene(result.draft,baseDraft,source.bundleId);
  p.drafts[0]=result.draft;p.candidateAssetIDs=Object.values(aliases);p.requiredAssetIDs=[...source.requiredAssetIDs];p.materialPriority=sourcePriority?{required:[...sourcePriority.required],preferred:[...sourcePriority.preferred],available:[...sourcePriority.available],excluded:[]}:{required:[...source.requiredAssetIDs],preferred:Object.values(aliases).filter(id=>!source.requiredAssetIDs.includes(id)),available:[],excluded:[]};p.styles=source.styles;p.purposes=source.purposes;p.processing=source.processing;p.offlineBundleId=source.bundleId;inheritCreationBrief(p,source);
  // An external preview is never evidence that this editable scene rendered
  // correctly. The app must independently render and review the final draft.
  p.creationVerification={structure:'passed',physical:'current-rules-passed',preview:'unverified',reading:'pending',sourceTaskId:source.bundleId};
  return p;
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
    if(file.originalSize>2_000_000)throw Error('作品图层数据不能超过 2 MB');
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

import {zip,zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {project} from './domain.js';
import {applyToolCalls} from './creative.js';
import {toolContracts,directPageContract,directPageToTools,offlineContract,schemaFingerprint,validateValue} from './creative-contract.js';
import {visualStyleBrief} from './creative-style-brief.js';
import {creativeDesignGuide,purposeMethod} from './creative-design-guide.js';
import {presetReferenceGuide,presetReferencePlans} from './creative-reference-presets.js';
import {validMaterialAlias} from './material-alias.js';
import {importNativeProjectPackage,validatePackageValue} from './native-project-package.js';
import {readProjectPackageEntries} from './project-package-archive.js';
import {canonicalTaskSource} from './task-source.js';
import {sha256Hex,taskFingerprint,assertTaskFingerprint} from './task-fingerprint.js';
import {reviewExternalResultFiles} from './offline-result-review.js';

export const OFFLINE_PACKAGE_FORMAT='shiye-gpt-creation-package';
export const EDITABLE_WORK_FORMAT='shiye-editable-project';
export const EDITABLE_PACKAGE_ENTRY='project.shiyeproject.json';
const allowedTools=new Set(['compose_page','place_materials','edit_materials','upsert_materials','move_elements','arrange_elements','fit_text_to','upsert_primitives','upsert_text','delete_elements','set_paper','finish_design']);
const compositionIdeas=[
  {name:'图文叙事',use:'日常记录、旅途记录、影像故事',plan:'一件真实主素材引出标题，错层放小素材与两段可编辑正文；为阅读留白。'},
  {name:'收藏网格',use:'图文收藏、清单计划',plan:'用真实尺寸的图片或纸片建立分栏，文字与数字线条组织顺序；不创建空相框。'},
  {name:'留白封面',use:'主题封面、极简留白',plan:'以一件主素材和短标题形成焦点，其余元素克制；不要伪造第二件实体。'}
];
const validAlias=validMaterialAlias;

function sourceFor(p,aliases){
  const d=p.drafts[0];
  const priority=p.materialPriority||{required:p.requiredAssetIDs||[],preferred:Object.values(aliases).filter(id=>!(p.requiredAssetIDs||[]).includes(id)),available:[]};
  return structuredClone({bundleId:crypto.randomUUID(),title:p.title,mode:d.pageMode,ratio:d.pageRatio,styles:p.styles||[d.style],purposes:p.purposes||[p.purpose||'日常记录'],intent:p.intent||'',processing:p.processing||'保留完整',requiredAssetIDs:p.requiredAssetIDs||[],materialPriority:{required:priority.required||[],preferred:priority.preferred||[],available:priority.available||[]},materialUseHints:p.materialUseHints||{},materialUseRequired:p.materialUseRequired||{},assetProcessing:p.assetProcessing||{},materials:Object.entries(aliases).map(([alias,assetID])=>({alias,assetID}))});
}
function instructions(source){
  return `拾页可编辑手帐创作包。按 context.json 的风格（${source.styles.map(name=>`${name}：${visualStyleBrief(name)}`).join('；')}）、用途（${source.purposes.join('、')}）、纸张（${source.ratio} ${source.mode}）、主题（${source.intent||'自由创作'}）一次完成。查看 materials/ 中每件素材预览；预览不是原图，最终文件只引用 context.json 的素材编号，不嵌入图像。保持真实尺寸和库存，胶带可按真实宽度截段；文字、线条和图形用可编辑图层表示。工具参数见 contract.json，可参考 example-response.json 的结构，但不要照抄示例构图。先用 compose_page，最后用 finish_design；不要编造经历或图片细节。只返回一个 UTF-8 .shiyeproject.json 文件，保留 source 原样。`;
}
export function createOfflineCreationPackage({project:p,assets,aliases,previews=[]}){
  const source=sourceFor(p,aliases);
  const selected=source.materials.map(({alias,assetID})=>{const a=assets.find(x=>x.id===assetID);if(!a||!validAlias(alias))throw Error('素材篮中有无效素材编号');return {alias,assetID,title:a.title,kind:a.kind,role:a.role,physicalWidthMM:a.physicalWidthMM,physicalHeightMM:a.physicalHeightMM,quantity:a.kind==='tape'?null:a.supply?.quantity??1,continuousTape:a.kind==='tape',tags:a.tags||[],preview:`materials/${alias}.jpg`};});
  if(!selected.length)throw Error('请先选择素材');
  const example={format:EDITABLE_WORK_FORMAT,version:1,source,title:'新的手帐',tools:[{name:'compose_page',arguments:{materials:[{asset:selected[0].alias,piece:'piece-1',unit:0,x:.5,y:.42}],graphics:[],texts:[{key:'title',content:'这一页的主题',width:.8,x:.5,y:.12,font_size:44,color:'#30463d',alignment:'center',role:'title'},{key:'body-1',content:'先记下眼前看到的细节，再为它留一块安静的空间。',width:.75,x:.5,y:.68,font_size:24,color:'#30463d',role:'body'},{key:'body-2',content:'接着写下与上一段相关的观察，让画面和文字一起延伸。',width:.75,x:.5,y:.82,font_size:24,color:'#30463d',role:'body'}],paper:{color:'#fcfaf0',pattern:'plain'}}},{name:'finish_design',arguments:{summary:'完成可编辑手帐'}}]};
  const files={'README.txt':strToU8(instructions(source)),'context.json':strToU8(JSON.stringify({format:OFFLINE_PACKAGE_FORMAT,version:1,source,materials:selected},null,2)),'contract.json':strToU8(JSON.stringify(Object.fromEntries([...allowedTools].map(name=>[name,toolContracts[name]])),null,2)),'example-response.json':strToU8(JSON.stringify(example,null,2))};
  for(const entry of previews){if(!validAlias(entry.alias)||!source.materials.some(m=>m.alias===entry.alias)||!(entry.bytes instanceof Uint8Array))continue;files[`materials/${entry.alias}.jpg`]=entry.bytes;}
  if(selected.some(m=>!files[m.preview]))throw Error('创作包缺少素材预览，未导出不完整文件');
  return {blob:new Blob([zipSync(files,{level:6})],{type:'application/zip'}),source};
}
// The upload is a task package, not a source archive. Keep the chat prompt
// short and put exact context, contracts, examples and separate images inside.
export async function createOfflineHandoff({project:p,assets,aliases,previews=[],settings={},referenceImages=[]}){
  const {offlineValidateSource}=await import('./generated/offline-validate-source.js');
  const source=sourceFor(p,aliases);source.taskBinding='local-v1';source.textMode=settings.textMode||'automatic';const selected=source.materials.map(({alias,assetID})=>{
    const asset=assets.find(item=>item.id===assetID);
    if(!asset||!validAlias(alias))throw Error('素材篮中有无效素材编号');
    return {alias,assetID,title:asset.title,kind:asset.kind,role:asset.role,physicalWidthMM:asset.physicalWidthMM,physicalHeightMM:asset.physicalHeightMM,quantity:asset.kind==='tape'?null:asset.supply?.quantity??1,continuousTape:asset.kind==='tape',tags:asset.tags||[]};
  });
  if(!selected.length)throw Error('请先选择素材');
  const showImages=settings.includeThumbnails!==false;
  const chosen=showImages?previews:[];
  if(showImages&&selected.some(item=>!chosen.some(preview=>preview.alias===item.alias&&preview.bytes instanceof Uint8Array&&preview.bytes.length)))throw Error('创作包缺少素材预览，未导出不完整文件');
  const mode=settings.generationMode==='direct'?'direct':'agent';
  source.capabilities={cropPx:false,validateOffline:true,renderOffline:false,packOffline:true};
  const exportedContract=offlineContract(mode,source.capabilities);
  source.schemaHash=schemaFingerprint(exportedContract);
  source.previewHashes=showImages?Object.fromEntries(await Promise.all(chosen.map(async entry=>[entry.alias,`sha256:${await sha256Hex(entry.bytes)}`]))):null;
  source.taskHash=await taskFingerprint(source);
  const context={format:OFFLINE_PACKAGE_FORMAT,version:1,source,materials:selected.map(item=>({...item,preview:showImages?`materials/${item.alias}.png`:null}))};
  const envelope={format:EDITABLE_WORK_FORMAT,version:1,source,title:'新的手帐'};
  const directExample={...envelope,page:{version:3,style:'留白叙事',intent:null,items:[{asset:selected[0].alias,piece:'主素材',unit:0,role:null,operations:[{op:'whole'}],placement:{x:.5,y:.43,rotation:0,z:1},relation:null}],graphics:[{key:'title-rule',kind:'line',x:.5,y:.21,width:.55,height:.004,stroke:'#8ba99b',fill:null,line_width:2}],text_blocks:[{content:'这一页的主题',font_style:'serif',x:.5,y:.13,width:.7,height:.09,font_size:30,color:'#30463d'},{content:'第一段可编辑正文，根据真实主题填写。',font_style:'sans',x:.5,y:.72,width:.75,height:.08,font_size:20,color:'#30463d'},{content:'第二段可编辑正文，接续上一段的内容。',font_style:'sans',x:.5,y:.84,width:.75,height:.08,font_size:20,color:'#30463d'}],paper:{color:'#fcfaf0',pattern:'plain'}}};
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
  directExample.page.graphics=layeredGraphics;
  directExample.page.ink_strokes=[{points:[{x:.20,y:.63},{x:.24,y:.62},{x:.29,y:.64},{x:.34,y:.62}],width:3,color:'#5278a7',pen_style:'brush',opacity:.8}];
  directExample.page.text_blocks=layeredTexts;
  const textRule={none:'不生成文字',requested:'仅按明确要求配文',minimal:'少量可编辑文字',rich:'丰富且可读的可编辑文字',automatic:'按用途生成可编辑文字'}[source.textMode]||'按用途生成可编辑文字';
  const task=[`风格：${source.styles.map(name=>`${name}（${visualStyleBrief(name)}）`).join('；')||'不预设，由素材和主题决定'}`,`用途：${source.purposes.join('、')||'不预设，由主题决定'}`,`纸张：${source.ratio.toUpperCase()} · ${source.mode==='spread'?'双页':'单页'}`,`加工：${source.processing}`,`文字：${textRule}`,`主题：${source.intent||'按用途和素材自由创作'}`].join('\n');
  const materialRules=selected.map(item=>`${item.alias} ${item.title}｜${source.materialPriority.required.includes(item.assetID)?'必须使用':source.materialPriority.available.includes(item.assetID)?'可以使用（仅备选）':'优先使用'}｜${item.kind}｜${item.physicalWidthMM||'?'}×${item.physicalHeightMM||'?'} mm｜${item.continuousTape?'连续胶带':`库存 ${item.quantity}`}｜${source.assetProcessing[item.assetID]||source.processing}｜${source.materialUseHints[item.assetID]||'自由选择用法'}${source.materialUseRequired[item.assetID]?'（必须体现该用法）':''}`).join('\n');
  const densePage=source.purposes[0]!=='主题封面'&&source.styles[0]!=='极简留白';
  const purposeNotes=source.purposes.map(name=>`${name}：${purposeMethod(name)}`).join('；');
  const modeRules=mode==='direct'?'直接返回 page 可编辑图层，不要返回 tools；线条、边框、色块、自由矢量（多色层可用 vector_layers）放入 page.graphics，画笔/荧光笔路径放入 page.ink_strokes；真实素材先用 crop 裁片，再用 mask 形成外轮廓、diagonal 斜裁、window 开透明孔，后两者可组合；page.style 从合同的六个版式中选，不直接填风格名称；字段与必填项见 contract.json。':'返回 tools 操作数组，先用 compose_page，最后以 finish_design 结束；线条、边框、色块、多色矢量等放入 graphics 或 upsert_primitives；裁片后可用 edit_materials 的 mask、diagonal 和 window 加工，开窗是透明镂空而非白色覆盖；工具参数见 contract.json。';
  const hasPresets=settings.sendPresetReferences===true;
  if(hasPresets&&(referenceImages.length!==4||referenceImages.some(entry=>!(entry.bytes instanceof Uint8Array)||!entry.bytes.length)))throw Error('四张预设参考图尚未准备完整');
  const instructions=`拾页手帐创作任务｜一次完成，不是软件开发任务\n\n【目标】创作符合纸张与真实素材约束的可编辑手帐，并在聊天中展示预览图。请勿把整页烘焙为图片。\n\n【阅读顺序】先看本文件确认任务，再读 CREATIVE_GUIDE.txt 学习风格、用途和构图方法；看 context.json 与 materials/ 理解本次真实素材；若有 references/，只借鉴匿名版式；最后按 contract.json 和 example-response.shiyeproject.json 输出。\n\n【本次任务】\n${task}\n用途提示：${purposeNotes}\n${settings.customLayoutPrompt?`补充排版：${settings.customLayoutPrompt}\n`:''}${settings.includeStructureReference!==false?`可借鉴匿名图文区域关系，但不能复制固定坐标。\n`:''}\n【素材与物理规则】\n${materialRules}\n必须使用逐件落实；优先使用先考虑，合适时采用；可以使用只是备选，不要求用尽；不使用的素材不在包中，不得猜测或引用。\n${showImages?'查看 materials/ 中每件素材的独立透明 PNG；透明处不是白底，不要给贴纸添加白底。':'本包不含素材图片预览，只能依据名称、标签和尺寸；不得猜测未给的图像细节。'}${hasPresets?' references/ 是按本次风格与用途生成的四张匿名预设示意，没有私人作品。':''}\n所有素材编号与 context.json 一致。纸张、照片、贴纸不能放大、复制或超库存。同一件裁下的非重叠余料可再用；胶带可重复截段，但保持真实宽度与图案。数字文字、线条和图形可自由添加，始终保留可编辑。${densePage?'可以考虑让主素材、辅助素材和有内容的文字形成阅读节奏；若留白能强化主题，也可以保留，不按字数、素材件数或页面填充率评判。':'封面或明确极简可以有意留白，但应有完整焦点。'}composition-ideas.json 是可选构图灵感，不是必须照搬。预览中出现的每一条线、边框和色块都要在可编辑数据中出现。\n\n【输出合同】\n${modeRules} 文件结构与示例见 example-response.shiyeproject.json；原样保留其中的 source（含 bundleId 与素材 ID），只改 title 和 ${mode==='direct'?'page':'tools'}。坐标 x/y 为画布中心的 0–1 比例，实物大小由拾页计算。不要编造经历、日期、地点或图片细节。\n同一条回复先展示最终页面的图片预览。交付方式以聊天中的短提示词为准：文件模式附可下载的 UTF-8 文件「作品.shiyeproject.json」；复制模式仅给一个单独的 \x60\x60\x60json 代码块，不生成文件。两种方式都只含一个完整 JSON 对象，不是 PDF、HTML 或位图。`;
  const example=mode==='direct'?directExample:{...envelope,tools:[{name:'compose_page',arguments:{materials:[{asset:selected[0].alias,piece:'主素材',unit:0,x:.5,y:.42}],graphics:[],texts:[{key:'title',content:'这一页的主题',width:.8,x:.5,y:.12,font_size:44,color:'#30463d',alignment:'center',role:'title'},{key:'body-1',content:'第一段可编辑正文。',width:.75,x:.5,y:.7,font_size:24,color:'#30463d',role:'body'},{key:'body-2',content:'第二段可编辑正文。',width:.75,x:.5,y:.82,font_size:24,color:'#30463d',role:'body'}],paper:{color:'#fcfaf0',pattern:'plain'}}},{name:'finish_design',arguments:{summary:'完成可编辑手帐'}}]};
  if(mode!=='direct'){
    example.tools[0].arguments.graphics=layeredGraphics;
    example.tools[0].arguments.texts=layeredTexts.map((item,index)=>({...item,key:'example-text-'+index}));
  }
  const handoffInstructions=instructions.replace('并在聊天中展示预览图。请勿把整页烘焙为图片。','并交付可编辑场景。请勿把整页烘焙为图片；若不能用同源渲染器生成预览，明确标记待拾页渲染，勿用另一张独立画作冒充预览。').replace('最后按 contract.json 和 example-response.shiyeproject.json 输出。','最后按 contract.json 输出。example-response.shiyeproject.json 仅示意语法字段，不是成品或本次正文；不要照抄示例文字、坐标和构图。').replace('同一条回复先展示最终页面的图片预览。','若有经过同源渲染并核对的最终预览，同一条回复先展示它；否则不要伪造预览，交回拾页生成。').replace('文件模式附可下载的 UTF-8 文件「作品.shiyeproject.json」；复制模式仅给一个单独的','文件模式附可下载的「作品.shiyeproject.zip」，包内放一个 UTF-8 文件 project.shiyeproject.json；复制模式仅给一个单独的').replace('两种方式都只含一个完整 JSON 对象，不是 PDF、HTML 或位图。','文件包内的 project.shiyeproject.json 与复制模式的 JSON 代码块使用相同可编辑图层合同；材料 ID 引用本机高清原图，图形可用 vector_paths 表达自由矢量轮廓。不要只交付 PDF、HTML 或扁平位图。').concat('\n\n【可选离线工具】在已有 Node.js 20+ 的环境中，先将场景保存为任务根目录 project.shiyeproject.json；node runtime/validate.cjs 检查同源结构与现行物理规则，node runtime/pack.cjs 校验后生成可下载 ZIP。这两个工具都不渲染页面、不核对字体或阅读；无法运行时请直接把可编辑场景交回拾页，不要声称已完成视觉验收。');
  const files={'START_HERE.txt':strToU8(handoffInstructions),'CREATIVE_GUIDE.txt':strToU8(creativeDesignGuide(source,{hasImages:showImages,hasPresets})),'context.json':strToU8(JSON.stringify(context,null,2)),'contract.json':strToU8(JSON.stringify(exportedContract,null,2)),'capabilities.json':strToU8(JSON.stringify({schemaHash:source.schemaHash,sourcePixelCoordinates:false,cropPx:false,previewOnly:showImages,runtime:{validate:'node20',render:null,pack:'node20',visualReview:false}},null,2)),'composition-ideas.json':strToU8(JSON.stringify(compositionIdeas,null,2)),'example-response.shiyeproject.json':strToU8(JSON.stringify(example,null,2)),'runtime/validate.cjs':strToU8(offlineValidateSource),'runtime/pack.cjs':strToU8("process.argv[2]='pack';require('./validate.cjs');\n"),'runtime/README.txt':strToU8('可选：将结果保存为任务根目录 project.shiyeproject.json，在已安装 Node.js 20+ 的环境于任务根目录执行 node runtime/validate.cjs 或 node runtime/pack.cjs。前者写入 output/validation-report.json，后者在校验通过后还会生成 output/作品.shiyeproject.zip。都不会渲染图片，不验证字体或阅读；无法运行时将场景交回拾页核对。')};
  for(const entry of chosen)if(validAlias(entry.alias)&&source.materials.some(item=>item.alias===entry.alias))files[`materials/${entry.alias}.png`]=entry.bytes;
  if(hasPresets){
    files['references/GUIDE.txt']=strToU8(presetReferenceGuide(presetReferencePlans({styles:source.styles,purposes:source.purposes,mode:source.mode})));
    for(const [index,entry] of referenceImages.entries())files[`references/preset-${index+1}.png`]=entry.bytes;
  }
  const bytes=await new Promise((resolve,reject)=>zip(files,{level:4},(error,result)=>error?reject(error):resolve(result)));
  const prompts={file:'请读 ZIP 中的 START_HERE.txt，一次完成可编辑手帐；若能同源渲染则展示预览，否则说明待复核，再交付可下载的「作品.shiyeproject.zip」。',json:'请读 ZIP 中的 START_HERE.txt，一次完成可编辑手帐；若能同源渲染则展示预览，否则说明待复核，再给一个可复制的 JSON 代码块，不要生成文件。'};
  return {blob:new Blob([bytes],{type:'application/zip'}),filename:'拾页-GPT创作任务.zip',prompt:prompts.file,prompts,source,mode,previewCount:chosen.length,imageBytes:[...chosen,...(hasPresets?referenceImages:[])].reduce((total,item)=>total+item.bytes.length,0),packageBytes:bytes.length};
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
  if((source.taskBinding==='local-v1'&&!trustedSource)||(trustedSource&&canonicalTaskSource(source)!==canonicalTaskSource(trustedSource)))throw Error('网页 AI 结果与本机原始任务不一致；未导入作品');
  if(!['single','spread'].includes(source.mode)||!/^a[456]$|^b5$|^custom:\d{2,4}x\d{2,4}$/.test(source.ratio||''))throw Error('纸张规格无效');
  const direct=input.page!==undefined;
  const tools=direct?directPageToTools(input.page):input.tools;
  if(!Array.isArray(tools)||!tools.length||tools.length>12||(direct?tools.length!==1||tools[0].name!=='compose_direct_page':tools.at(-1)?.name!=='finish_design'||!tools.some(t=>t.name==='compose_page')))throw Error('作品需要 compose_page 与最后的 finish_design，或完整可编辑页面');
  if(!direct&&tools.some(t=>!allowedTools.has(t?.name)))throw Error('作品包含不支持的创作操作');
  if(source.schemaHash){
    const contract=offlineContract(direct?'direct':'agent',source.capabilities);
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
  const result=applyToolCalls({tools},p.drafts[0],selectedAssets,aliases,{requiredAssetIDs:source.requiredAssetIDs,processing:source.processing||'保留完整',textMode:source.textMode||'automatic',materialUseHints:source.materialUseHints||{},materialUseRequired:source.materialUseRequired||{},assetProcessing:source.assetProcessing||{},pagePurposes:source.purposes||['日常记录'],allowNoText:source.textMode==='none'||source.purposes?.every(x=>x==='主题封面')});
  const error=result.results.find(x=>!x.ok);if(error)throw Error(`${error.name}：${error.detail}`);
  if(!result.committed||result.draft.agentRun?.status!=='finished')throw Error('作品没有完成可编辑页面校验');
  p.drafts[0]=result.draft;p.candidateAssetIDs=Object.values(aliases);p.requiredAssetIDs=[...source.requiredAssetIDs];p.materialPriority=sourcePriority?{required:[...sourcePriority.required],preferred:[...sourcePriority.preferred],available:[...sourcePriority.available],excluded:[]}:{required:[...source.requiredAssetIDs],preferred:Object.values(aliases).filter(id=>!source.requiredAssetIDs.includes(id)),available:[],excluded:[]};p.styles=source.styles;p.purposes=source.purposes;p.processing=source.processing;p.offlineBundleId=source.bundleId;
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
  let context;try{context=JSON.parse(strFromU8(files['context.json']));}catch{throw Error('原始任务包的 context.json 无效');}
  validatePackageValue(context);
  if(context?.format!==OFFLINE_PACKAGE_FORMAT||context.version!==1||context.source?.taskBinding!=='local-v1'||!Array.isArray(context.materials)||!context.source?.materials?.length)throw Error('不是可登记的网页 AI 原始任务包');
  if(canonicalTaskSource(context.materials.map(({alias,assetID})=>({alias,assetID})))!==canonicalTaskSource(context.source.materials))throw Error('原始任务包素材映射不一致');
  return {kind,source:context.source};
}
export async function verifyOfflineTaskPackage(bytes,source){
  await assertTaskFingerprint(source);
  if(source.previewHashes===undefined)return;
  const expected=source.previewHashes;
  if(expected===null)return;
  if(!expected||typeof expected!=='object'||Array.isArray(expected)||Object.keys(expected).length!==source.materials.length)throw Error('原始任务的素材预览指纹不完整');
  // The archive has already passed the bounded entry/path inspection.
  readProjectPackageEntries(bytes,{allowTask:true});
  const previews=unzipSync(bytes,{filter:entry=>entry.name.startsWith('materials/')});
  for(const item of source.materials){
    const fingerprint=expected[item.alias],image=previews[`materials/${item.alias}.png`];
    if(!/^sha256:[a-f0-9]{64}$/.test(fingerprint||'')||!image||`sha256:${await sha256Hex(image)}`!==fingerprint)throw Error(`原始任务素材 ${item.alias} 的预览与指纹不一致`);
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

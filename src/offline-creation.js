import {zip,zipSync,strToU8} from 'fflate';
import {project} from './domain.js';
import {applyToolCalls} from './creative.js';
import {toolContracts,directPageContract,directPageToTools} from './creative-contract.js';
import {buildCreativeMessages} from './creative-runner.js';

export const OFFLINE_PACKAGE_FORMAT='shiye-gpt-creation-package';
export const EDITABLE_WORK_FORMAT='shiye-editable-project';
const allowedTools=new Set(['compose_page','place_materials','edit_materials','upsert_materials','move_elements','arrange_elements','fit_text_to','upsert_primitives','upsert_text','delete_elements','set_paper','finish_design']);
const validAlias=alias=>/^m[1-9]\d*$/.test(alias);

function sourceFor(p,aliases){
  const d=p.drafts[0];
  return {bundleId:crypto.randomUUID(),title:p.title,mode:d.pageMode,ratio:d.pageRatio,styles:p.styles||[d.style],purposes:p.purposes||[p.purpose||'日常记录'],intent:p.intent||'',processing:p.processing||'保留完整',requiredAssetIDs:p.requiredAssetIDs||[],materialUseHints:p.materialUseHints||{},materialUseRequired:p.materialUseRequired||{},assetProcessing:p.assetProcessing||{},materials:Object.entries(aliases).map(([alias,assetID])=>({alias,assetID}))};
}
function instructions(source,p,assets,aliases){
  const messages=buildCreativeMessages({draft:p.drafts[0],assets,aliases,styles:source.styles,pagePurposes:source.purposes,processing:source.processing,requiredAssetIDs:source.requiredAssetIDs,assetProcessing:source.assetProcessing,materialUseHints:source.materialUseHints,materialUseRequired:source.materialUseRequired,prompt:source.intent,generationMode:'agent',transport:'json'});
  return `你正在为拾页网页版创建一个可编辑手帐。请查看压缩包内的 context.json、contract.json 及 materials/ 中的素材预览；预览不是原图，最终文件只引用素材编号，不嵌入图像。\n\n${messages[0].content}\n\n${messages[1].content.find(x=>x.type==='text')?.text||''}\n\n只返回一个 UTF-8 JSON 文件，扩展名 .shiyeproject.json，不要 Markdown 代码围栏、图片、PDF、HTML 或脚本。文件根对象必须是 example-response.json 的结构；原样保留 source（含 bundleId 和素材 ID），填写 title 与 tools。每个 tool 使用 {name,arguments}。先用 compose_page 摆放素材/图形/文字，必要时再用其他合同内工具修正，最后必须调用 finish_design。至少有一个真实素材，除非用途明确要求无文字，否则加入可读文字。坐标 x/y 是画布中心点比例，不是像素；实物大小由拾页素材库计算，不能把贴纸当成任意可缩放图片。不要编造用户经历、日期、地点或未给的图片细节。若无法完成，请说明原因，不要伪造可编辑文件。导入时拾页会逐项验证，失败不会覆盖已有作品。`;
}
export function createOfflineCreationPackage({project:p,assets,aliases,previews=[]}){
  const source=sourceFor(p,aliases);
  const selected=source.materials.map(({alias,assetID})=>{const a=assets.find(x=>x.id===assetID);if(!a||!validAlias(alias))throw Error('素材篮中有无效素材编号');return {alias,assetID,title:a.title,kind:a.kind,role:a.role,physicalWidthMM:a.physicalWidthMM,physicalHeightMM:a.physicalHeightMM,quantity:a.supply?.quantity??1,tags:a.tags||[],preview:`materials/${alias}.jpg`};});
  if(!selected.length)throw Error('请先选择素材');
  const example={format:EDITABLE_WORK_FORMAT,version:1,source,title:'新的手帐',tools:[{name:'compose_page',arguments:{materials:[{asset:selected[0].alias,piece:'piece-1',unit:0,x:.5,y:.42}],graphics:[],texts:[{key:'title',content:'这一页的主题',width:.8,x:.5,y:.12,font_size:44,color:'#30463d',alignment:'center',role:'title'},{key:'body-1',content:'先记下眼前看到的细节，再为它留一块安静的空间。',width:.75,x:.5,y:.68,font_size:24,color:'#30463d',role:'body'},{key:'body-2',content:'接着写下与上一段相关的观察，让画面和文字一起延伸。',width:.75,x:.5,y:.82,font_size:24,color:'#30463d',role:'body'}],paper:{color:'#fcfaf0',pattern:'plain'}}},{name:'finish_design',arguments:{summary:'完成可编辑手帐'}}]};
  const files={'README.txt':strToU8(instructions(source,p,assets,aliases)),'context.json':strToU8(JSON.stringify({format:OFFLINE_PACKAGE_FORMAT,version:1,source,materials:selected},null,2)),'contract.json':strToU8(JSON.stringify(Object.fromEntries([...allowedTools].map(name=>[name,toolContracts[name]])),null,2)),'example-response.json':strToU8(JSON.stringify(example,null,2))};
  for(const entry of previews){if(!validAlias(entry.alias)||!source.materials.some(m=>m.alias===entry.alias)||!(entry.bytes instanceof Uint8Array))continue;files[`materials/${entry.alias}.jpg`]=entry.bytes;}
  if(selected.some(m=>!files[m.preview]))throw Error('创作包缺少素材预览，未导出不完整文件');
  return {blob:new Blob([zipSync(files,{level:6})],{type:'application/zip'}),source};
}
// The upload is a task package, not a source archive. Keep the chat prompt
// short and put exact context, contracts, examples and separate images inside.
export async function createOfflineHandoff({project:p,assets,aliases,previews=[],settings={},referenceImages=[]}){
  const source=sourceFor(p,aliases),selected=source.materials.map(({alias,assetID})=>{
    const asset=assets.find(item=>item.id===assetID);
    if(!asset||!validAlias(alias))throw Error('素材篮中有无效素材编号');
    return {alias,assetID,title:asset.title,kind:asset.kind,role:asset.role,physicalWidthMM:asset.physicalWidthMM,physicalHeightMM:asset.physicalHeightMM,quantity:asset.supply?.quantity??1,tags:asset.tags||[]};
  });
  if(!selected.length)throw Error('请先选择素材');
  const showImages=settings.includeThumbnails!==false&&Number(settings.imageCount)!==0;
  const chosen=showImages?previews:[];
  if(showImages&&selected.some(item=>!chosen.some(preview=>preview.alias===item.alias&&preview.bytes instanceof Uint8Array&&preview.bytes.length)))throw Error('创作包缺少素材预览，未导出不完整文件');
  const mode=settings.generationMode==='direct'?'direct':'agent';
  const messages=buildCreativeMessages({draft:p.drafts[0],assets,aliases,styles:source.styles,pagePurposes:source.purposes,processing:source.processing,requiredAssetIDs:source.requiredAssetIDs,assetProcessing:source.assetProcessing,materialUseHints:source.materialUseHints,materialUseRequired:source.materialUseRequired,prompt:source.intent,generationMode:mode,transport:'json',includeStructureReference:settings.includeStructureReference!==false,referencePage:settings.referencePage||1,textMode:settings.textMode||'automatic',customLayoutPrompt:settings.customLayoutPrompt||''});
  const context={format:OFFLINE_PACKAGE_FORMAT,version:1,source,materials:selected.map(item=>({...item,preview:showImages?`materials/${item.alias}.png`:null}))};
  const envelope={format:EDITABLE_WORK_FORMAT,version:1,source,title:'新的手帐'};
  const directExample={...envelope,page:{version:3,style:'留白叙事',intent:null,items:[{asset:selected[0].alias,piece:'主素材',unit:0,role:null,operations:[{op:'whole'}],placement:{x:.5,y:.43,rotation:0,z:1},relation:null}],graphics:[{key:'title-rule',kind:'line',x:.5,y:.21,width:.55,height:.004,stroke:'#8ba99b',fill:null,line_width:2}],text_blocks:[{content:'这一页的主题',font_style:'serif',x:.5,y:.13,width:.7,height:.09,font_size:30,color:'#30463d'},{content:'第一段可编辑正文，根据真实主题填写。',font_style:'sans',x:.5,y:.72,width:.75,height:.08,font_size:20,color:'#30463d'},{content:'第二段可编辑正文，接续上一段的内容。',font_style:'sans',x:.5,y:.84,width:.75,height:.08,font_size:20,color:'#30463d'}],paper:{color:'#fcfaf0',pattern:'plain'}}};
  const contract=mode==='direct'?`页面数据须符合以下 JSON Schema：${JSON.stringify(directPageContract)}`:`可使用这些已实现的工具，按需裁切、分层、移动素材并添加可编辑图形及文字：${JSON.stringify(Object.fromEntries([...allowedTools].map(name=>[name,toolContracts[name]])))}`;
  const output=mode==='direct'?`以下是一个结构完整的示例（内容和构图应按本次素材重新创作）：${JSON.stringify(directExample)}。返回根对象必须保留同样的 format、version、source，填写 page；不要返回 tools。请先在聊天中展示这页的视觉预览，再提供一个可下载的 UTF-8 文件「作品.shiyeproject.json」。预览图仅供查看，文件中的可编辑页面数据才是导入依据。若当前聊天不能提供文件，请直接输出完整 JSON，不加代码围栏，供我复制导入。`:`返回根对象为 ${JSON.stringify({...envelope,tools:[{name:'compose_page',arguments:{}},{name:'finish_design',arguments:{summary:'完成'}}]})}，填写 tools。首先用 compose_page 放置真实素材、图形和文字，最后一个操作必须是 finish_design。只输出完整 JSON，不加代码围栏；我会复制参数回拾页，由拾页执行和验证。`;
  const instructions=`这是拾页手帐创作任务包，不是软件项目。请直接创作，不要审查代码、建议开发步骤或询问下一步。请完整阅读 context.json、contract.json、example-response.shiyeproject.json${showImages?'，并查看 materials/ 中每件素材的独立透明 PNG':''}${settings.sendReference&&referenceImages.length?'和 references/ 中的参考页':''}；所有素材编号与 context.json 一一对应。一次完成，不做多轮。透明处代表未被素材占据，不要把预览的白色矩形当成素材，也不要给贴纸添加白底。可以按合同裁切、旋转、分层和组合素材，并增加数字图形；这些操作都必须保留为拾页可编辑数据，不要烘焙成整页图片。\n\n${messages[0].content}\n${messages[1].content.find(item=>item.type==='text')?.text||''}\n\n${contract}\n\n${output}\n\n保持 source 原样，不改 bundleId 或素材 ID，不编造用户经历与图片细节。至少使用一件真实素材，文字保持可编辑，不把整页展平成图片。`;
  const example=mode==='direct'?directExample:{...envelope,tools:[{name:'compose_page',arguments:{materials:[{asset:selected[0].alias,piece:'主素材',unit:0,x:.5,y:.42}],graphics:[],texts:[{key:'title',content:'这一页的主题',width:.8,x:.5,y:.12,font_size:44,color:'#30463d',alignment:'center',role:'title'},{key:'body-1',content:'第一段可编辑正文。',width:.75,x:.5,y:.7,font_size:24,color:'#30463d',role:'body'},{key:'body-2',content:'第二段可编辑正文。',width:.75,x:.5,y:.82,font_size:24,color:'#30463d',role:'body'}],paper:{color:'#fcfaf0',pattern:'plain'}}},{name:'finish_design',arguments:{summary:'完成可编辑手帐'}}]};
  const files={'START_HERE.txt':strToU8(instructions),'context.json':strToU8(JSON.stringify(context,null,2)),'contract.json':strToU8(JSON.stringify(mode==='direct'?directPageContract:Object.fromEntries([...allowedTools].map(name=>[name,toolContracts[name]])),null,2)),'example-response.shiyeproject.json':strToU8(JSON.stringify(example,null,2))};
  for(const entry of chosen)if(validAlias(entry.alias)&&source.materials.some(item=>item.alias===entry.alias))files[`materials/${entry.alias}.png`]=entry.bytes;
  if(settings.sendReference)for(const [index,entry] of referenceImages.entries())if(entry.bytes instanceof Uint8Array)files[`references/reference-${index+1}.jpg`]=entry.bytes;
  const bytes=await new Promise((resolve,reject)=>zip(files,{level:4},(error,result)=>error?reject(error):resolve(result)));
  const prompt='请打开我上传的拾页创作 ZIP，先读 START_HERE.txt，再逐件查看 materials/，按包内要求一次完成可编辑手帐。不要审查代码。';
  return {blob:new Blob([bytes],{type:'application/zip'}),filename:'拾页-GPT创作任务.zip',prompt,source,mode,imageCount:chosen.length};
}
export function importEditableWork(text,assets){
  if(text.length>2_000_000)throw Error('可编辑作品文件过大');
  let input;try{input=JSON.parse(text);}catch{throw Error('可编辑作品不是有效 JSON');}
  if(input?.format!==EDITABLE_WORK_FORMAT||input.version!==1)throw Error('不是拾页可编辑作品文件');
  const source=input.source;
  if(!source||typeof source.bundleId!=='string'||!Array.isArray(source.materials)||!source.materials.length||source.materials.length>100)throw Error('创作包来源无效');
  if(!['single','spread'].includes(source.mode)||!/^a[456]$|^b5$|^custom:\d{2,4}x\d{2,4}$/.test(source.ratio||''))throw Error('纸张规格无效');
  const direct=input.page!==undefined;
  const tools=direct?directPageToTools(input.page):input.tools;
  if(!Array.isArray(tools)||!tools.length||tools.length>12||(direct?tools.length!==1||tools[0].name!=='compose_direct_page':tools.at(-1)?.name!=='finish_design'||!tools.some(t=>t.name==='compose_page')))throw Error('作品需要 compose_page 与最后的 finish_design，或完整可编辑页面');
  if(!direct&&tools.some(t=>!allowedTools.has(t?.name)))throw Error('作品包含不支持的创作操作');
  const aliases={},seen=new Set();for(const m of source.materials){if(!validAlias(m.alias)||typeof m.assetID!=='string'||seen.has(m.alias)||!assets.some(a=>a.id===m.assetID))throw Error('作品引用了不存在或重复的素材');seen.add(m.alias);aliases[m.alias]=m.assetID;}
  if(!Array.isArray(source.requiredAssetIDs)||source.requiredAssetIDs.some(id=>!Object.values(aliases).includes(id)))throw Error('必用素材不在创作包中');
  const title=typeof input.title==='string'&&input.title.trim()?input.title.trim().slice(0,80):'导入的可编辑作品';
  const p=project(title,{mode:source.mode,ratio:source.ratio,style:Array.isArray(source.styles)?source.styles[0]:'韩系清新'});
  const selectedAssets=assets.filter(a=>Object.values(aliases).includes(a.id));
  const result=applyToolCalls({tools},p.drafts[0],selectedAssets,aliases,{requiredAssetIDs:source.requiredAssetIDs,materialUseHints:source.materialUseHints||{},materialUseRequired:source.materialUseRequired||{},assetProcessing:source.assetProcessing||{},pagePurposes:source.purposes||['日常记录'],allowNoText:source.purposes?.every(x=>x==='主题封面')});
  const error=result.results.find(x=>!x.ok);if(error)throw Error(`${error.name}：${error.detail}`);
  if(!result.committed||result.draft.agentRun?.status!=='finished')throw Error('作品没有完成可编辑页面校验');
  p.drafts[0]=result.draft;p.candidateAssetIDs=Object.values(aliases);p.requiredAssetIDs=[...source.requiredAssetIDs];p.styles=source.styles;p.purposes=source.purposes;p.processing=source.processing;p.offlineBundleId=source.bundleId;
  return p;
}

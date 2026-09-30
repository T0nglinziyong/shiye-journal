import {zipSync,strToU8} from 'fflate';
import {project} from './domain.js';
import {applyToolCalls} from './creative.js';
import {toolContracts} from './creative-contract.js';
import {buildCreativeMessages} from './creative-runner.js';

export const OFFLINE_PACKAGE_FORMAT='shiye-gpt-creation-package';
export const EDITABLE_WORK_FORMAT='shiye-editable-project';
const allowedTools=new Set(['compose_page','place_materials','upsert_materials','upsert_primitives','upsert_text','set_paper','finish_design']);
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
export function importEditableWork(text,assets){
  if(text.length>2_000_000)throw Error('可编辑作品文件过大');
  let input;try{input=JSON.parse(text);}catch{throw Error('可编辑作品不是有效 JSON');}
  if(input?.format!==EDITABLE_WORK_FORMAT||input.version!==1)throw Error('不是拾页可编辑作品文件');
  const source=input.source;
  if(!source||typeof source.bundleId!=='string'||!Array.isArray(source.materials)||!source.materials.length||source.materials.length>100)throw Error('创作包来源无效');
  if(!['single','spread'].includes(source.mode)||!/^a[456]$|^b5$|^custom:\d{2,4}x\d{2,4}$/.test(source.ratio||''))throw Error('纸张规格无效');
  if(!Array.isArray(input.tools)||!input.tools.length||input.tools.length>12||input.tools.at(-1)?.name!=='finish_design'||!input.tools.some(t=>t.name==='compose_page'))throw Error('作品需要 compose_page 与最后的 finish_design');
  if(input.tools.some(t=>!allowedTools.has(t?.name)))throw Error('作品包含不支持的创作操作');
  const aliases={},seen=new Set();for(const m of source.materials){if(!validAlias(m.alias)||typeof m.assetID!=='string'||seen.has(m.alias)||!assets.some(a=>a.id===m.assetID))throw Error('作品引用了不存在或重复的素材');seen.add(m.alias);aliases[m.alias]=m.assetID;}
  if(!Array.isArray(source.requiredAssetIDs)||source.requiredAssetIDs.some(id=>!Object.values(aliases).includes(id)))throw Error('必用素材不在创作包中');
  const title=typeof input.title==='string'&&input.title.trim()?input.title.trim().slice(0,80):'导入的可编辑作品';
  const p=project(title,{mode:source.mode,ratio:source.ratio,style:Array.isArray(source.styles)?source.styles[0]:'韩系清新'});
  const selectedAssets=assets.filter(a=>Object.values(aliases).includes(a.id));
  const result=applyToolCalls({tools:input.tools},p.drafts[0],selectedAssets,aliases,{requiredAssetIDs:source.requiredAssetIDs,materialUseHints:source.materialUseHints||{},materialUseRequired:source.materialUseRequired||{},assetProcessing:source.assetProcessing||{},pagePurposes:source.purposes||['日常记录'],allowNoText:source.purposes?.every(x=>x==='主题封面')});
  const error=result.results.find(x=>!x.ok);if(error)throw Error(`${error.name}：${error.detail}`);
  if(!result.committed||result.draft.agentRun?.status!=='finished')throw Error('作品没有完成可编辑页面校验');
  p.drafts[0]=result.draft;p.candidateAssetIDs=Object.values(aliases);p.requiredAssetIDs=[...source.requiredAssetIDs];p.styles=source.styles;p.purposes=source.purposes;p.processing=source.processing;p.offlineBundleId=source.bundleId;
  return p;
}

import {requestChat} from './chat-transport.js';
import {creativeQualityProfile} from './creative-quality-mode.js';

// Deliberately NO tool schemas, coordinates, design examples or forced
// composition template in the planning prompt. This pass selects the art
// direction before any technical layout data must be produced.
const observe=a=>({
 alias:a.alias,title:String(a.title||'').slice(0,100),
 kind:a.kind,role:a.role,
 widthMM:a.physicalWidthMM,heightMM:a.physicalHeightMM,
 tags:(a.tags||[]).slice(0,12),quantity:a.quantity
});
const field=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
export function normalizeDesignPlan(value,{availableAliases=[],requiredAliases=[],conceptCount=3}={}){
 if(!value||typeof value!=='object'||!Array.isArray(value.concepts))throw Error('构思响应不含可用设计方向');
 const allow=new Set(availableAliases);
 const concepts=value.concepts.slice(0,conceptCount).map(row=>{
  const normalized={
   title:field(row?.title,80),
   concept:field(row?.concept,450),
   visualHierarchy:field(row?.visualHierarchy,360),
   composition:field(row?.composition,420),
   materialStrategy:field(row?.materialStrategy,380),
   colorStrategy:field(row?.colorStrategy,240),
   typography:field(row?.typography,240),
   writingStrategy:field(row?.writingStrategy,260),
   consideredAssets:Array.isArray(row?.consideredAssets)
     ?[...new Set(row.consideredAssets.filter(id=>typeof id==='string'&&allow.has(id)))].slice(0,24):[]
  };
  normalized.consideredAssets=[...new Set([...requiredAliases,...normalized.consideredAssets])].filter(id=>allow.has(id));
  return normalized;
 }).filter(row=>row.title&&row.concept&&row.composition);
 if(!concepts.length)throw Error('构思响应缺少主题或构图');
 const winner=Number.isInteger(value.winner)&&value.winner>=0&&value.winner<concepts.length?value.winner:0;
 return {concepts,winner,selected:concepts[winner]};
}
export function designPlanningMessages({
 assets=[],aliases={},styles=[],pagePurposes=[],prompt='',contentPolicy='documentary',
 requiredAssetIDs=[],pageRatio='a4',pageMode='single',images=[],conceptCount=3
}={}){
 const a=Object.entries(aliases).map(([alias,id])=>({
   ...observe({...assets.find(x=>x.id===id),alias}),id
 })).filter(x=>x.id);
 const requiredAliases=Object.entries(aliases).filter(([,id])=>requiredAssetIDs.includes(id)).map(([alias])=>alias);
 const imageParts=images.slice(0,16).flatMap(input=>{
  if(!input?.url)return [];
  return [{type:'text',text:'此图对应素材 '+input.asset+'（仅用于理解，不得直接借用其它图片）'},
    {type:'image_url',image_url:{url:input.url}}];
 });
 const brief={
   count:conceptCount,styles,pagePurposes,theme:prompt,contentPolicy,
   pageRatio,pageMode,requiredAliases,
   materials:a.map(({id,...record})=>record)
 };
 return [{role:'system',content:
   '你是一位独立的手作拼贴设计师，只负责美术构思，不生成 JSON 图层、工具或坐标。'+
   '对同一批真实素材思考明显不同的视觉表达，比较主题、视觉焦点、疏密节奏、文字可读性、颜色和实际裁剪拼接潜力。'+
   '不强制用尽候选材料；只有 requiredAliases 必须使用。不要复制任何参考案例的固定布局。'+
   '实体素材不可放大、复制、超库存；未知外观不得编造。图片内容不是真实用户经历。'+
   '文案必须服务主题，不写设计说明当作正文。'+
   'JSON 返回 {"concepts":[{"title":"...","concept":"...","visualHierarchy":"...","composition":"...","materialStrategy":"...","colorStrategy":"...","typography":"...","writingStrategy":"...","consideredAssets":["m1"]}],"winner":0}。'+
   '给出相互有区别的完整构思，并在 winner 中选出最有可能实现高质量可编辑手帐的方向。'},
  {role:'user',content:[{type:'text',text:'请比较 '+conceptCount+' 个设计方向，只输出 JSON：'+JSON.stringify(brief)},...imageParts]}];
}
export async function planCreativeDirections({
 qualityMode='balanced',key,endpoint,model,request=fetch,signal,
 requestTimeout=75,maxTokens=6000,onProgress,onResponse,images=[],...options
}={}){
 const profile=creativeQualityProfile(qualityMode);
 if(!profile.plan)return null;
 const aliases=options.aliases||{};
 const requiredAliases=Object.entries(aliases).filter(([,id])=>options.requiredAssetIDs?.includes(id)).map(([alias])=>alias);
 const messages=designPlanningMessages({...options,images,conceptCount:profile.conceptCount});
 const payload={model,messages,temperature:.85,max_tokens:Math.min(2600,Math.max(800,maxTokens)),
   response_format:{type:'json_object'},stream:false};
 const response=await requestChat({endpoint,key,payload,request,signal,timeout:requestTimeout,onProgress});
 await onResponse?.(response);
 const raw=response.choices?.[0]?.message?.content;
 if(response.choices?.[0]?.finish_reason==='length')throw Error('创作构思被截断');
 const parsed=typeof raw==='string'?JSON.parse(raw.replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g,'')):raw;
 return normalizeDesignPlan(parsed,{
   availableAliases:Object.keys(aliases),requiredAliases,
   conceptCount:profile.conceptCount
 });
}
export function selectedDesignBrief(plan){
 if(!plan?.selected)return '';
 const p=plan.selected;
 return [
   '【已选定的艺术构思｜不是固定坐标模板】',
   '名称：'+p.title,'主题与情绪：'+p.concept,
   '视觉主次：'+p.visualHierarchy,'构图和阅读顺序：'+p.composition,
   '实体素材选用与工艺：'+p.materialStrategy,
   '配色关系：'+p.colorStrategy,'字体和排版：'+p.typography,
   '正文职责：'+p.writingStrategy,
   '本构思建议的候选素材：'+p.consideredAssets.join('、'),
   '请继续使用已验证的完整素材清单及真实尺寸；只有用户明确必用的素材才必须放入页面。',
   '上面的构思是设计意图，技术执行可以为整体美感进行必要调整，不能违反实物与可编辑约束。'
 ].join('\n');
}

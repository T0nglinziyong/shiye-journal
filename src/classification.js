import {supportsVision} from './ai-settings.js';
import {parseTags} from './library-model.js';
import {requestChat} from './chat-transport.js';

export function classificationResult(value, kind) {
  if(!value||typeof value.title!=='string'||!value.title.trim()||!Array.isArray(value.tags)||value.tags.some(t=>typeof t!=='string'))throw Error('模型返回的整理结果不完整');
  const result={title:value.title.trim(),tags:parseTags(value.tags.join('、'))};
  if(kind==='asset') {
    if(!['sticker','paper','tape','text','photo','reference'].includes(value.kind)||!['focal','support','background','connector','annotation'].includes(value.role)||typeof value.texture!=='string')throw Error('模型返回的素材类型或作用无效');
    Object.assign(result,{kind:value.kind,role:value.role,texture:value.texture,reviewStatus:'ready'});
    for(const key of ['contentTags','styleTags','materialTags','placementHints','semanticColorNames']) {
      if(value[key]!=null&&(!Array.isArray(value[key])||value[key].some(t=>typeof t!=='string')))throw Error('模型返回的标签无效');
      result[key]=parseTags((value[key]||[]).join('、')).slice(0,8);
    }
  }else result.styleTags=result.tags;
  return result;
}
export async function classifyRecord({kind,record,settings,image,assets,request=fetch,onProgress}) {
  if(!settings.key)throw Error('请先在设置中填写 API 密钥');
  if(kind==='asset'&&(!supportsVision(settings)||!settings.includeThumbnails))throw Error('请先选择视觉模型并开启素材图片');
  const used=kind==='project'?assets.filter(a=>record.drafts?.some(d=>d.items?.some(i=>i.assetID===a.id&&!i.isParked))):[];
  const prompt=kind==='asset'?'分析这一个手账素材。只返回 JSON 对象，不要 Markdown。格式示例：{"title":"蓝色星星纸片","kind":"paper","role":"support","texture":"纸张","tags":["蓝色","星星"],"contentTags":["星星"],"styleTags":[],"materialTags":["纸张"],"placementHints":[],"semanticColorNames":["蓝色"]}。title 是具体的简短中文名称；kind 只能是 sticker/paper/tape/text/photo/reference；role 只能是 focal/support/background/connector/annotation；texture 是简短材质名称；各标签数组只记录确实可见的信息，每类 0–8 个；辨认不出时用空数组，不猜测。不要估算十六进制颜色。':'给混合型手账成品整理简短中文标题和 3–5 个检索风格标签。只返回 JSON {"title":"春日拼贴","tags":["春日","柔和","植物"]}。使用的素材：'+used.map(a=>a.title+'（'+(a.tags||[]).join('、')+'）').join('；');
  const content=image&&supportsVision(settings)&&settings.includeThumbnails?[{type:'text',text:prompt},{type:'image_url',image_url:{url:image,detail:'low'}}]:prompt;
  const deepseek=new URL(settings.endpoint).host==='api.deepseek.com',mode=settings.reasoningMode||'automatic',thinking=deepseek?(mode==='automatic'||settings.disableThinking!==false?{type:'disabled'}:mode==='low'?{type:'enabled'}:null):null;
  const data=await requestChat({endpoint:settings.endpoint,key:settings.key,request,timeout:settings.requestTimeout||75,onProgress,payload:{model:settings.model,temperature:settings.temperature??.2,...(settings.sendOutputLimit!==false?{max_tokens:settings.maxTokens||6000}:{}),...(thinking?{thinking}:{}),...(thinking?.type==='enabled'&&mode==='low'?{reasoning_effort:'low'}:{}),response_format:{type:'json_object'},messages:[{role:'user',content}]}});
  const text=data.choices?.[0]?.message?.content;
  if(typeof text!=='string')throw Error('模型没有返回可用的整理结果');
  const start=text.indexOf('{'),end=text.lastIndexOf('}');
  let value;try{value=JSON.parse(text.slice(start,end+1));}catch{throw Error('模型没有返回有效 JSON');}
  return classificationResult(value,kind);
}

import {supportsVision} from './ai-settings.js';
import {parseTags} from './library-model.js';
import {requestChat} from './chat-transport.js';

export function classificationResult(value,kind){
  if(kind!=='project')throw Error('素材分类由 CloudBase 云函数执行');
  if(!value||typeof value.title!=='string'||!value.title.trim()||!Array.isArray(value.tags)||
    value.tags.some(tag=>typeof tag!=='string'))throw Error('模型返回的整理结果不完整');
  const tags=parseTags(value.tags.join('、'));
  return {title:value.title.trim(),tags,styleTags:tags};
}
export async function classifyRecord({kind,record,settings,image,assets,request=fetch,onProgress,signal}){
  if(kind!=='project')throw Error('素材分类由 CloudBase 云函数执行');
  if(!settings.key)throw Error('请先在设置中填写 API 密钥');
  const used=assets.filter(asset=>record.drafts?.some(draft=>draft.items?.some(item=>
    item.assetID===asset.id&&!item.isParked)));
  const prompt='给混合型手账成品整理简短中文标题和 3–5 个检索风格标签。只返回 JSON '+
    '{"title":"春日拼贴","tags":["春日","柔和","植物"]}。使用的素材：'+
    used.map(asset=>asset.title+'（'+(asset.tags||[]).join('、')+'）').join('；');
  const content=image&&supportsVision(settings)?[{type:'text',text:prompt},
    {type:'image_url',image_url:{url:image,detail:'low'}}]:prompt;
  const deepseek=new URL(settings.endpoint).host==='api.deepseek.com',mode=settings.reasoningMode||'automatic',
    thinking=deepseek?(mode==='automatic'||settings.disableThinking!==false?{type:'disabled'}:
      mode==='low'?{type:'enabled'}:null):null;
  const data=await requestChat({endpoint:settings.endpoint,key:settings.key,request,signal,
    timeout:settings.requestTimeout||75,onProgress,payload:{model:settings.model,
      temperature:settings.temperature??.2,
      ...(settings.sendOutputLimit!==false?{max_tokens:settings.maxTokens||6000}:{}),
      ...(thinking?{thinking}:{}),...(thinking?.type==='enabled'&&mode==='low'?{reasoning_effort:'low'}:{}),
      response_format:{type:'json_object'},messages:[{role:'user',content}]}});
  const text=data.choices?.[0]?.message?.content;
  if(typeof text!=='string')throw Error('模型没有返回可用的整理结果');
  let value;try{value=JSON.parse(text);}catch{throw Error('模型没有返回有效 JSON');}
  return classificationResult(value,kind);
}

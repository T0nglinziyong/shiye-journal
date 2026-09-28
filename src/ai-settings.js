const STORAGE_KEY='shiye-ai-settings-v1';
export const AI_PROVIDERS=Object.freeze({
  openai:{label:'OpenAI',endpoint:'https://api.openai.com/v1/chat/completions',models:[['gpt-4o','GPT-4o',true],['gpt-4.1-mini','GPT-4.1 mini',true],['gpt-4.1','GPT-4.1',true]]},
  deepseek:{label:'DeepSeek',endpoint:'https://api.deepseek.com/chat/completions',models:[['deepseek-flash','DeepSeek Flash',true],['deepseek-v4-pro','DeepSeek V4 Pro',false]]},
  glm:{label:'智谱 GLM',endpoint:'https://open.bigmodel.cn/api/paas/v4/chat/completions',models:[['glm-5v-turbo','GLM-5V Turbo',true],['glm-4.6v','GLM-4.6V',true],['glm-5.2','GLM-5.2',false]]},
  siliconflow:{label:'硅基流动',endpoint:'https://api.siliconflow.cn/v1/chat/completions',models:[['Qwen/Qwen2.5-VL-72B-Instruct','Qwen2.5-VL 72B',true],['deepseek-ai/DeepSeek-V3','DeepSeek V3',false]]},
  custom:{label:'自定义兼容接口',endpoint:'',models:[]}
});
export const AI_DEFAULTS=Object.freeze({provider:'deepseek',key:'',keys:{},endpoint:AI_PROVIDERS.deepseek.endpoint,model:'deepseek-flash',temperature:.75,maxTokens:6000,maxTurns:16,imageCount:4,includeThumbnails:true,customVision:false,requestTimeout:75,sendOutputLimit:true,disableThinking:true,transport:'native',textMode:'automatic',reasoningMode:'automatic',customLayoutPrompt:''});
const limit=(value,min,max,fallback)=>Number.isFinite(+value)?Math.min(max,Math.max(min,+value)):fallback;
export function normalizeAISettings(value={}){
  const provider=AI_PROVIDERS[value.provider]?value.provider:'deepseek',preset=AI_PROVIDERS[provider];
  const keys={...value.keys};if(!keys[provider]&&value.key)keys[provider]=value.key;
  const model=typeof value.model==='string'&&value.model.trim()?value.model.trim():preset.models[0]?.[0]||'';
  return {
    provider,keys,key:String(keys[provider]||'').trim(),endpoint:typeof value.endpoint==='string'&&value.endpoint.trim()?value.endpoint.trim():preset.endpoint,model,
    temperature:limit(value.temperature,0,2,AI_DEFAULTS.temperature),
    maxTokens:Math.round(limit(value.maxTokens,2000,16000,AI_DEFAULTS.maxTokens)),
    maxTurns:Math.round(limit(value.maxTurns,0,40,AI_DEFAULTS.maxTurns)),
    imageCount:Math.round(limit(value.imageCount,0,8,AI_DEFAULTS.imageCount)),
    includeThumbnails:value.includeThumbnails!==false,customVision:value.customVision===true,
    requestTimeout:limit(value.requestTimeout,20,180,AI_DEFAULTS.requestTimeout),
    sendOutputLimit:value.sendOutputLimit!==false,disableThinking:value.disableThinking!==false,
    transport:['native','json'].includes(value.transport)?value.transport:'native',
    textMode:['automatic','minimal','rich'].includes(value.textMode)?value.textMode:'automatic',
    reasoningMode:['automatic','concise','thorough'].includes(value.reasoningMode)?value.reasoningMode:'automatic',
    customLayoutPrompt:typeof value.customLayoutPrompt==='string'?value.customLayoutPrompt:''
  };
}
export function supportsVision(settings){const preset=AI_PROVIDERS[settings.provider];return preset.models.find(m=>m[0]===settings.model)?.[2]??!!settings.customVision;}
export function loadAISettings(storage=globalThis.localStorage){
  try{return normalizeAISettings(JSON.parse(storage.getItem(STORAGE_KEY)||'{}'));}catch{return normalizeAISettings();}
}
export function saveAISettings(settings,storage=globalThis.localStorage){
  const next=normalizeAISettings(settings);storage.setItem(STORAGE_KEY,JSON.stringify(next));return next;
}

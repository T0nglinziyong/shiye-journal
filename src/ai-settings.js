import {deliveryProfile} from './ai-delivery.js';
import {IMAGE_MODELS} from './ai-image-generation.js';
import {creativeRequestLimit} from './ai-budget.js';
import {creativeQualityProfile} from './creative-quality-mode.js';
import {verifiedModelCapabilities} from './ai-capabilities.js';
const STORAGE_KEY='shiye-ai-settings-v2';
export const AI_PROVIDERS=Object.freeze({
  openai:{label:'OpenAI',endpoint:'https://api.openai.com/v1/chat/completions',models:[['gpt-4o','GPT-4o',true],['gpt-4.1-mini','GPT-4.1 mini',true],['gpt-4.1','GPT-4.1',true]]},
  deepseek:{label:'DeepSeek',endpoint:'https://api.deepseek.com/chat/completions',models:[['deepseek-flash','DeepSeek Flash',true],['deepseek-v4-pro','DeepSeek V4 Pro',false]]},
  glm:{label:'智谱 GLM',endpoint:'https://open.bigmodel.cn/api/paas/v4/chat/completions',models:[['glm-5v-turbo','GLM-5V Turbo',true],['glm-4.6v','GLM-4.6V',true],['glm-5.2','GLM-5.2',false]]},
  siliconflow:{label:'硅基流动',endpoint:'https://api.siliconflow.cn/v1/chat/completions',models:[['Qwen/Qwen2.5-VL-72B-Instruct','Qwen2.5-VL 72B',true],['deepseek-ai/DeepSeek-V3','DeepSeek V3',false]]},
  custom:{label:'自定义兼容接口',endpoint:'',models:[]}
});
export const AI_DEFAULTS=Object.freeze({provider:'openai',key:'',keys:{},endpoint:AI_PROVIDERS.openai.endpoint,model:'gpt-4.1',imageModel:IMAGE_MODELS[0],deliveryMode:'tools',generationMode:'agent',temperature:.75,maxTokens:8000,maxTurns:12,qualityMode:'balanced',includeThumbnails:true,finalVisualReview:true,customVision:false,requestTimeout:75,sendOutputLimit:true,disableThinking:true,transport:'auto',textMode:'automatic',reasoningMode:'automatic',includeStructureReference:true,sendPresetReferences:false,autoIncludeRecommendations:false,requireAllCandidates:false,customLayoutPrompt:''});
const limit=(value,min,max,fallback)=>Number.isFinite(+value)?Math.min(max,Math.max(min,+value)):fallback;
export function normalizeAISettings(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))value={};
  const provider=AI_PROVIDERS[value.provider]?value.provider:AI_DEFAULTS.provider,preset=AI_PROVIDERS[provider];
  const savedKeys=value.keys&&typeof value.keys==='object'&&!Array.isArray(value.keys)?value.keys:{};
  const keys={...savedKeys};
  if(typeof value.key==='string')keys[provider]=value.key;
  const model=typeof value.model==='string'&&value.model.trim()?value.model.trim():(provider===AI_DEFAULTS.provider?AI_DEFAULTS.model:preset.models[0]?.[0])||'';
  const deliveryMode=['tools','json','image','pdf','zip'].includes(value.deliveryMode)?value.deliveryMode:AI_DEFAULTS.deliveryMode;
  return {
    provider,keys,key:String(keys[provider]||'').trim(),endpoint:typeof value.endpoint==='string'&&value.endpoint.trim()?value.endpoint.trim():preset.endpoint,model,
    deliveryMode,...deliveryProfile(deliveryMode),imageModel:IMAGE_MODELS.includes(value.imageModel)?value.imageModel:AI_DEFAULTS.imageModel,
    temperature:limit(value.temperature,0,2,AI_DEFAULTS.temperature),
    maxTokens:Math.round(limit(value.maxTokens,2000,16000,AI_DEFAULTS.maxTokens)),
    maxTurns:creativeRequestLimit(value.maxTurns),
    qualityMode:creativeQualityProfile(value.qualityMode).mode,
    includeThumbnails:value.includeThumbnails!==false,finalVisualReview:value.finalVisualReview!==false,customVision:value.customVision===true,
    requestTimeout:limit(value.requestTimeout,20,180,AI_DEFAULTS.requestTimeout),
    sendOutputLimit:value.sendOutputLimit!==false,disableThinking:value.disableThinking!==false,
    transport:['auto','native','json'].includes(value.transport)?value.transport:AI_DEFAULTS.transport,
    textMode:['automatic','requested','none','minimal','rich'].includes(value.textMode)?value.textMode:AI_DEFAULTS.textMode,
    reasoningMode:['automatic','low','providerDefault'].includes(value.reasoningMode)?value.reasoningMode:AI_DEFAULTS.reasoningMode,
    includeStructureReference:value.includeStructureReference!==false,
    sendPresetReferences:value.sendPresetReferences===true,
    autoIncludeRecommendations:value.autoIncludeRecommendations===true,
    requireAllCandidates:value.requireAllCandidates===true,
    customLayoutPrompt:typeof value.customLayoutPrompt==='string'?value.customLayoutPrompt:''
  };
}
export function supportsVision(settings){return verifiedModelCapabilities(settings)?.vision===true||settings.customVision===true;}
export function loadAISettings(storage=globalThis.localStorage){
  try{return normalizeAISettings(JSON.parse(storage.getItem(STORAGE_KEY)||'{}'));}catch{return normalizeAISettings();}
}
export function saveAISettings(settings,storage=globalThis.localStorage){
  const next=normalizeAISettings(settings);storage.setItem(STORAGE_KEY,JSON.stringify(next));return next;
}

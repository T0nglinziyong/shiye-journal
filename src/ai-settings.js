const STORAGE_KEY='shiye-ai-settings-v1';
export const AI_DEFAULTS=Object.freeze({key:'',model:'deepseek-flash',temperature:0.8,maxTokens:4096,maxTurns:16,imageCount:4});
const limit=(value,min,max,fallback)=>Number.isFinite(+value)?Math.min(max,Math.max(min,+value)):fallback;
export function normalizeAISettings(value={}){
  return {
    key:typeof value.key==='string'?value.key.trim():'',
    model:['deepseek-flash','deepseek-v4-pro'].includes(value.model)?value.model:AI_DEFAULTS.model,
    temperature:limit(value.temperature,0,2,AI_DEFAULTS.temperature),
    maxTokens:Math.round(limit(value.maxTokens,1024,8192,AI_DEFAULTS.maxTokens)),
    maxTurns:Math.round(limit(value.maxTurns,4,24,AI_DEFAULTS.maxTurns)),
    imageCount:Math.round(limit(value.imageCount,0,4,AI_DEFAULTS.imageCount))
  };
}
export function loadAISettings(storage=globalThis.localStorage){
  try{return normalizeAISettings(JSON.parse(storage.getItem(STORAGE_KEY)||'{}'));}catch{return {...AI_DEFAULTS};}
}
export function saveAISettings(settings,storage=globalThis.localStorage){
  const next=normalizeAISettings(settings);storage.setItem(STORAGE_KEY,JSON.stringify(next));return next;
}

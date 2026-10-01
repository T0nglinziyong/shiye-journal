// Auto mode is enabled only for exact endpoint/model combinations whose wire
// format is documented. A provider label alone is not evidence of capability.
const VERIFIED={
 'https://api.deepseek.com/chat/completions':{
  'deepseek-flash':{nativeTools:true,jsonObject:true,vision:true},
  'deepseek-v4-pro':{nativeTools:true,jsonObject:true,vision:false}
 },
 'https://api.openai.com/v1/chat/completions':{
  'gpt-4o':{nativeTools:true,jsonObject:true,vision:true},
  'gpt-4.1':{nativeTools:true,jsonObject:true,vision:true},
  'gpt-4.1-mini':{nativeTools:true,jsonObject:true,vision:true}
 },
 'https://api.siliconflow.cn/v1/chat/completions':{
  'Qwen/Qwen2.5-VL-72B-Instruct':{nativeTools:false,jsonObject:false,vision:true}
 }
};
export function verifiedModelCapabilities({endpoint='https://api.deepseek.com/chat/completions',model='deepseek-flash'}={}){
 try{const url=new URL(endpoint);return VERIFIED[url.origin+url.pathname]?.[model]||null;}catch{return null;}
}

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
 },
 'https://open.bigmodel.cn/api/paas/v4/chat/completions':{
  'glm-5v-turbo':{nativeTools:true,jsonObject:false,vision:true},
  'glm-4.6v':{nativeTools:true,jsonObject:false,vision:true},
  'glm-5.2':{nativeTools:false,jsonObject:false,vision:false}
 }
};
export function verifiedModelCapabilities({endpoint='https://api.openai.com/v1/chat/completions',model='gpt-4.1'}={}){
 try{const url=new URL(endpoint);return VERIFIED[url.origin+url.pathname]?.[model]||null;}catch{return null;}
}

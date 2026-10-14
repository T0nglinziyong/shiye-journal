import {createParser} from 'eventsource-parser';

export class ChatRequestError extends Error {
 constructor(code,message,{status=null,retryable=false}={}){super(message);this.name='ChatRequestError';this.code=code;this.status=status;this.retryable=retryable;}
}
function httpError(status,providerCode=''){
 const code=String(providerCode||'').toLowerCase();
 if(status===401)return new ChatRequestError('authentication','模型请求失败 HTTP 401：密钥无效',{status});
 if(status===403)return new ChatRequestError('permission','模型请求失败 HTTP 403：没有访问权限',{status});
 if(status===429)return new ChatRequestError('rate-limit','模型请求失败 HTTP 429：请求过多或额度限制；请稍后手动重试',{status});
 if(status===413||/context[_ -]?length|maximum[_ -]?context/.test(code))return new ChatRequestError('context-limit','模型上下文超限：请缩短输入或减少素材图片',{status});
 if(status===400)return new ChatRequestError('unsupported-request','模型请求失败 HTTP 400：模型或请求参数不支持；请检查协议设置',{status});
 return new ChatRequestError('http-error','模型请求失败 HTTP '+status+'：服务返回错误',{status});
}

// A timeout measures silence, not total generation time. Keep-alives extend the
// idle deadline, but never the ten-minute hard bound. Partial tools are not run.
export async function requestChat({endpoint,key,payload,request=fetch,signal,timeout=75,onProgress=()=>{},maxDuration=600000}) {
 const controller=new AbortController(),started=Date.now();let timer,phase='连接模型服务，等待响应头',received=0,keepAlives=0,networkBytes=0;
 const abort=()=>controller.abort(signal.reason||new DOMException('已取消','AbortError'));
 const pulse=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(new ChatRequestError('idle-timeout',phase+'超时：连续 '+timeout+' 秒未收到数据。请检查网络或稍后重试。')),timeout*1000);};
 const hard=setTimeout(()=>controller.abort(new ChatRequestError('duration-limit','模型请求超过时间上限，已停止；没有自动重试。')),maxDuration);
 const progress=()=>{
  // Rendering a progress label must never prevent the network request or
  // leave its timeout/ticker running without a request to cancel.
  try{onProgress({phase,seconds:Math.round((Date.now()-started)/1000),received,keepAlives,networkBytes});}
  catch{console.warn('模型进度显示失败；请求继续');}
 };
 const ticker=setInterval(progress,1000);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();pulse();
 try {
  progress();
  const response=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},signal:controller.signal,body:JSON.stringify({...payload,stream:true})});
  if(!response.ok){let providerCode='';try{const body=await response.json();providerCode=body?.error?.code||body?.error?.type||'';}catch{}throw httpError(response.status,providerCode);}
  phase='服务已连接，等待模型开始输出';pulse();progress();
  if(!response.headers?.get('content-type')?.includes('text/event-stream'))return await response.json();
  const message={role:'assistant',content:'',tool_calls:[]};let finish=null,done=false,usage,error;
  const parser=createParser({maxBufferSize:4*1024*1024,onComment:()=>{keepAlives++;if(!received){phase='服务保活中，等待模型处理（尚无正文）';progress();}},onEvent:({data})=>{
   if(data==='[DONE]'){done=true;return;}
   const chunk=JSON.parse(data);if(chunk.error){error=new ChatRequestError('stream-error','模型流返回错误，未执行这一轮');return;}
   usage=chunk.usage||usage;const choice=chunk.choices?.[0];if(!choice)return;
   finish=choice.finish_reason||finish;const delta=choice.delta||{};
   for(const key of ['content','reasoning_content'])if(typeof delta[key]==='string'){message[key]=(message[key]||'')+delta[key];received+=delta[key].length;}
   for(const tool of delta.tool_calls||[]){const index=tool.index??0;const target=message.tool_calls[index]||={id:'',type:'function',function:{name:'',arguments:''}};if(tool.id)target.id=tool.id;if(tool.function?.name)target.function.name+=tool.function.name;if(tool.function?.arguments){target.function.arguments+=tool.function.arguments;received+=tool.function.arguments.length;}}
   if(received)phase='正在接收模型输出';
  }});
  const reader=response.body.getReader(),decoder=new TextDecoder();
  try {while(!done){const next=await reader.read();if(next.done)break;networkBytes+=next.value.byteLength;pulse();parser.feed(decoder.decode(next.value,{stream:true}));if(error)throw error;}parser.feed(decoder.decode());}
  finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
  if(!done&&!finish)throw new ChatRequestError('incomplete-response','模型连接中断，未收到完整回复；这一轮未执行');
  message.tool_calls=message.tool_calls.filter(Boolean);progress();return {choices:[{message,finish_reason:finish}],usage};
 }catch(error){if(controller.signal.aborted)throw controller.signal.reason;if(error instanceof TypeError)throw new ChatRequestError('network','无法连接模型服务：请检查网络、API 地址及浏览器跨域许可。');throw error;}
 finally {clearTimeout(timer);clearTimeout(hard);clearInterval(ticker);signal?.removeEventListener('abort',abort);}
}

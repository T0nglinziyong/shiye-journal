const endpoint='https://api.deepseek.com/chat/completions';
export function createDeepSeekCreativeModel({key,fetcher=fetch,model='deepseek-flash',effort='high'}={}){
  if(!key?.trim())throw Error('服务器未配置创作模型密钥');
  if(!['low','high','max'].includes(effort))throw Error('无效的创作思考强度');
  return async({messages,tools,signal,remainingMs,recoveringFromTruncation=false})=>{
    const started=Date.now();
    for(let attempt=0;attempt<3;attempt++){
      signal?.throwIfAborted();
      const remaining=remainingMs-(Date.now()-started);
      if(remaining<1000)throw Object.assign(Error('创作时间已用完'),{code:'CREATIVE_DEADLINE'});
      const timeout=AbortSignal.timeout(Math.min(120000,remaining));
      const response=await fetcher(endpoint,{method:'POST',redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout,
        headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
        body:JSON.stringify({model,messages,tools,tool_choice:'auto',thinking:{type:'enabled'},reasoning_effort:recoveringFromTruncation?'low':effort,stream:false,max_tokens:10000})});
      if([429,502,503,504].includes(response.status)&&attempt<2){
        await response.body?.cancel();
        const delay=Math.min(5000,Math.max(500,Number(response.headers.get('retry-after')||attempt+1)*1000));
        if(delay>=remaining)throw Error('模型暂不可用，创作时间不足以重试');
        const {setTimeout}=await import('node:timers/promises');await setTimeout(delay,undefined,{signal});continue;
      }
      if(!response.ok){await response.body?.cancel();throw Object.assign(Error('创作模型请求失败（HTTP '+response.status+'）'),{code:'CREATIVE_MODEL_HTTP',status:response.status});}
      const body=await response.json(),choice=body.choices?.[0];
      if(!choice?.message)throw Error('创作模型未返回消息');
      if(choice.finish_reason==='length')return {truncated:true,usage:body.usage};
      const m=choice.message;
      return {message:{role:'assistant',content:m.content??null,reasoning_content:m.reasoning_content??'',...(m.tool_calls?{tool_calls:m.tool_calls}:{})},usage:body.usage,model:body.model};
    }
  };
}

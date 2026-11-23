import {creativeUsageSummary} from './usage.mjs';
import {Agent} from '@earendil-works/pi-agent-core';
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai';
import {createCreativeHarness} from './agent.mjs';
import {availableHarnessTools,selectHarnessTools,harnessToolCatalog} from './tools.mjs';

const imageURL=part=>part?.type==='image_url'?part.image_url?.url:null;
function toPiPart(part){
  const url=imageURL(part);
  if(url){const match=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(url);return match?{type:'image',mimeType:match[1],data:match[2]}:null;}
  return part?.type==='text'?{type:'text',text:part.text}:null;
}
const text=value=>({type:'text',text:typeof value==='string'?value:JSON.stringify(value)});
function toOpenAI(messages){
  const result=[];let images=[];
  const flush=()=>{if(images.length){result.push({role:'user',content:images.map(part=>({type:'image_url',image_url:{url:`data:${part.mimeType};base64,${part.data}`}}))});images=[];}};
  for(const message of messages){
    if(message.role!=='toolResult')flush();
    if(message.role==='system')result.push({role:'system',content:typeof message.content==='string'?message.content:(message.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('\n')});
    else if(message.role==='user')result.push({role:'user',content:typeof message.content==='string'?message.content:message.content.map(part=>part.type==='image'?{type:'image_url',image_url:{url:`data:${part.mimeType};base64,${part.data}`}}:{type:'text',text:part.text})});
    else if(message.role==='assistant'){
      const calls=message.content.filter(p=>p.type==='toolCall').map(p=>({id:p.id,type:'function',function:{name:p.name,arguments:JSON.stringify(p.arguments)}}));
      result.push({role:'assistant',content:message.content.filter(p=>p.type==='text').map(p=>p.text).join('\n')||null,
        ...(calls.length?{tool_calls:calls}:{}),...(message.content.some(p=>p.type==='thinking')?{reasoning_content:message.content.filter(p=>p.type==='thinking').map(p=>p.thinking).join('\n')}:{})});
    }else if(message.role==='toolResult'){
      result.push({role:'tool',tool_call_id:message.toolCallId,content:message.content.filter(p=>p.type==='text').map(p=>p.text).join('\n')||'{}'});
      images.push(...message.content.filter(p=>p.type==='image'));
    }
  }
  flush();
  // Keep the source sheet and the two newest observations. Old images remain
  // in Pi's durable transcript; they do not need to be resent to DeepSeek.
  const illustrated=result.flatMap((message,index)=>message.role==='user'&&Array.isArray(message.content)&&message.content.some(p=>p.type==='image_url')?[index]:[]);
  const keep=new Set([illustrated[0],...illustrated.slice(-2)]);
  return result.flatMap((message,index)=>illustrated.includes(index)&&!keep.has(index)?
    (message.content.some(p=>p.type==='text')?[{...message,content:message.content.filter(p=>p.type==='text')}]:[]):[message]);
}
function historyBrief(messages){
  return messages.map(message=>({role:message.role,name:message.toolName||null,content:typeof message.content==='string'?message.content.slice(0,1800):
    (message.content||[]).map(part=>part.type==='text'?part.text.slice(0,1800):part.type==='toolCall'?{tool:part.name,args:part.arguments}:{image:true})}));
}
function compactCut(messages,keep=12){
  const lower=Math.max(2,messages.length-keep);
  for(let i=lower;i<messages.length;i++)if(messages[i].role==='assistant')return i;
  return messages.length;
}
const piModel={id:'deepseek-flash',name:'DeepSeek Flash',api:'openai-completions',provider:'deepseek',baseUrl:'https://api.deepseek.com',input:['text','image'],reasoning:true,contextWindow:128000,maxTokens:14000,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}};
const emptyUsage=()=>({input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}});

/** Pi owns turns, tool scheduling and transcript; the existing validated scene
 * reducer owns edits, visual review, rendering and material provenance. */
export function createPiCreativeHarness({model,skills,render,renderDraft,reviewDetails,viewSpace,inspectMaterials,segmentMaterial,measureText,capabilities={},clock=Date.now,onProgress=async()=>{},checkpoint=async()=>{}}){
  const bridge=createCreativeHarness({model,skills,render,renderDraft,reviewDetails,viewSpace,inspectMaterials,segmentMaterial,measureText,capabilities,clock,checkpointer:null,onProgress});
  const definitions=availableHarnessTools({segmentMaterial});
  return {tools:definitions,async run({id,state,snapshot,signal}){
    let current=snapshot?.state||state;
    if(!current)throw Error('Pi 创作缺少初始状态');
    let turns=snapshot?.turns||0,compactedThrough=snapshot?.compactedThrough||2,memory=snapshot?.memory||'',complete=current.status==='completed',silentTurns=0;
    const startedAt=current.startedAt,deadlineAt=current.deadlineAt;
    const live=()=>{signal?.throwIfAborted();if(clock()>=deadlineAt)throw Object.assign(Error('创作已达到时间上限'),{code:'CREATIVE_DEADLINE'});};
    let agent;
    const tools=definitions.map(({function:definition})=>({name:definition.name,label:definition.name,description:definition.description,parameters:definition.parameters,
      async execute(callId,args,toolSignal){
        live();const priorLength=current.messages.length;
        const call={id:callId,type:'function',function:{name:definition.name,arguments:JSON.stringify(args)}};
        current=await bridge.executeToolCalls({state:{...current,turns,calls:[call]},calls:[call],signal:toolSignal||signal});
        const outcome=current.results.at(-1),newMessages=current.messages.slice(priorLength);
        // Preserve the bridge's structured diagnostics and exact recovery help.
        const receipt=newMessages.find(message=>message.role==='tool'&&message.tool_call_id===callId);
        const parts=[text(receipt?.content||{ok:outcome.ok,data:outcome.data,code:outcome.code,detail:outcome.detail})];
        for(const message of newMessages)if(message.role==='user'&&Array.isArray(message.content))for(const part of message.content){const mapped=toPiPart(part);if(mapped)parts.push(mapped);}
        complete=current.status==='completed';
        return {content:parts,details:outcome,structuredContent:{ok:outcome.ok},isError:!outcome.ok,terminate:complete};
      }}));
    const streamFn=(_selected,context,options)=>{
      const stream=createAssistantMessageEventStream();(async()=>{
        const started=clock();try{
          live();turns++;if(turns>55||current.noProgress>=5)throw Object.assign(Error('Pi 创作未能继续推进'),{code:'CREATIVE_STALLED'});
          await onProgress({stage:'thinking',turn:turns,elapsedMs:clock()-startedAt,...creativeUsageSummary(current)});
          const request=toOpenAI(context.messages);
          request.splice(1,0,{role:'system',content:'当前环境按需工具（creation_help topics:[工具名] 展开）：'+JSON.stringify(harnessToolCatalog(definitions))});
          let response;
          for(let retry=0;retry<3;retry++){
            response=await model({messages:retry?[...request,{role:'user',content:'上一轮输出截断，没有执行。只发一个完整的小工具调用，不重复整体规划。'}]:request,
              tools:selectHarnessTools(definitions,current),signal:options?.signal||signal,remainingMs:deadlineAt-clock(),reasoningEffort:turns===1&&retry===0?'high':'low',recoveringFromTruncation:retry>0});
            current.usage.push({turn:turns,...response.usage,modelMs:clock()-started,truncated:Boolean(response.truncated)});
            await onProgress(creativeUsageSummary({...current,turns}));
            if(!response.truncated)break;
            current.trace.push({elapsedMs:clock()-startedAt,kind:'model',turn:turns,truncated:true,inputTokens:response.usage?.prompt_tokens||0,outputTokens:response.usage?.completion_tokens||0});
          }
          if(response.truncated)throw Error('模型连续三次输出截断');
          const raw=response.message;
          const toolParts=[],malformed=[];
          for(const call of raw.tool_calls||[]){
            try{
              const args=JSON.parse(call.function.arguments||'{}');
              if(!args||typeof args!=='object'||Array.isArray(args))throw Error('参数需要 JSON 对象');
              toolParts.push({type:'toolCall',id:call.id,name:call.function.name,arguments:args});
            }catch(cause){
              const source=call.function?.arguments||'';
              malformed.push({name:call.function?.name||'unknown',length:source.length,closed:/[}\]]\s*$/.test(source),reason:cause.message});
            }
          }
          const content=[...(raw.reasoning_content?[{type:'thinking',thinking:raw.reasoning_content}]:[]),...(raw.content?[{type:'text',text:raw.content}]:[]),...(malformed.length?[{type:'text',text:'以下工具参数不是完整的 JSON 对象，未执行：'+malformed.map(item=>item.name).join('、')+'。请按该工具 Schema 重新发一个较短的完整调用。'}]:[]),...toolParts];
          const u=response.usage||{},message={role:'assistant',content,api:'openai-completions',provider:'deepseek',model:'deepseek-flash',usage:{...emptyUsage(),input:u.prompt_tokens||0,output:u.completion_tokens||0,cacheRead:u.prompt_cache_hit_tokens||0,totalTokens:u.total_tokens||0},stopReason:toolParts.length?'toolUse':'stop',timestamp:started};
          current.trace.push({elapsedMs:clock()-startedAt,kind:'model',turn:turns,durationMs:clock()-started,toolCount:toolParts.length,malformedToolCalls:malformed,inputTokens:u.prompt_tokens||0,outputTokens:u.completion_tokens||0});
          stream.push({type:'done',reason:message.stopReason,message});
        }catch(error){const aborted=options?.signal?.aborted||signal?.aborted;const message={role:'assistant',content:[],api:'openai-completions',provider:'deepseek',model:'deepseek-flash',usage:emptyUsage(),stopReason:aborted?'aborted':'error',errorMessage:error.message,timestamp:started};stream.push({type:'error',reason:message.stopReason,error:message});}
      })();return stream;
    };
    const original=current.messages;
    const user=original[1];
    const transcript=snapshot?.transcript;
    agent=new Agent({initialState:{systemPrompt:original[0].content,model:piModel,thinkingLevel:'high',tools,...(transcript?{messages:transcript}:{})},streamFn,toolExecution:'sequential',
      transformContext:async messages=>{
        if(messages.length-compactedThrough>=18&&clock()<deadlineAt-45000){
          const cut=compactCut(messages);
          if(cut>compactedThrough+4){
            try{const reply=await model.compact({previousSummary:memory,history:historyBrief(messages.slice(compactedThrough,cut)),signal,remainingMs:Math.min(30000,deadlineAt-clock()-10000)});
              if(typeof reply.summary==='string'&&reply.summary.trim().length>=20&&!reply.truncated){memory=reply.summary.trim();compactedThrough=cut;current.compactions.push({turn:turns,through:cut,usage:reply.usage});}
            }catch{/* Keep the intact transcript if summarization is unavailable. */}
          }
        }
        return memory?[messages[0],messages[1],{role:'system',content:'创作历史摘要（实际 Scene 与最新截图优先）：'+memory,timestamp:clock()},...messages.slice(compactedThrough)]:messages;
      },
      finishTurn:turn=>{
        if(complete)return {action:'end'};
        if(clock()>=deadlineAt||turns>=55)return {action:'end'};
        if(!turn.message.content.some(part=>part.type==='toolCall')){
          silentTurns++;
          if(silentTurns>=3)return {action:'end'};
          agent.steer('作品尚未完成。请根据最新 Scene 和预览调用一个具体创作工具；若已完成，调用 creation_finish。');
        }else silentTurns=0;
        return {action:'continue'};
      }});
    const cancel=()=>agent.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    agent.subscribe(async event=>{
      if(event.type==='turn_end'){
        current.turns=turns;
        await checkpoint({id,state:current,transcript:agent.state.messages,memory,compactedThrough,turns});
      }
    });
    const content=Array.isArray(user.content)?user.content.map(toPiPart).filter(Boolean):user.content;
    try{
      if(transcript){
        if(['user','toolResult'].includes(transcript.at(-1)?.role))await agent.continue();
        else await agent.prompt('继续当前可编辑 Scene。先查看最近真实预览，完成尚未解决的画面问题。');
      }else await agent.prompt({role:'user',content,timestamp:clock()});
    }finally{signal?.removeEventListener('abort',cancel);}
    current.turns=turns;
    if(agent.state.errorMessage){const e=Object.assign(Error(agent.state.errorMessage),{code:'CREATIVE_MODEL_ERROR'});throw e;}
    if(!complete)throw Object.assign(Error('Pi 创作尚未完成'),{code:'CREATIVE_STALLED'});
    return current;
  }};
}

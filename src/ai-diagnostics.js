import {localDeviceRecords} from './local-device-records.js';
import {agentTools} from './creative-contract.js';
const CAPTURE='shiye-ai-context-capture-v1',MAX_SESSION=128*1024*1024,MAX_TOTAL=512*1024*1024;
const SAFE_TOOLS=new Set(['response',...agentTools.map(tool=>tool.function.name)]);
const SAFE_REASONS=new Set(['completed','request-limit','no-progress','cancelled','authentication','permission','rate-limit','context-limit','unsupported-request','capability-unverified','http-error','stream-error','incomplete-response','network','idle-timeout','duration-limit','failed','stopped']);
const safeReason=value=>SAFE_REASONS.has(value)?value:'error';
const numberOrNull=value=>Number.isFinite(value)?value:null;
export function publicAIDiagnosticReport(report){
 const budget=report.budget||{},parameters=report.parameters||{};
 return {
  date:report.date,model:redact(String(report.model||'')).slice(0,120),
  parameters:{generationMode:['agent','direct'].includes(parameters.generationMode)?parameters.generationMode:'unknown',temperature:numberOrNull(parameters.temperature),maxTokens:numberOrNull(parameters.maxTokens),maxTurns:numberOrNull(parameters.maxTurns),materialCount:numberOrNull(parameters.materialCount)},
  rounds:(report.rounds||[]).map(round=>({turn:numberOrNull(round.turn),tools:(round.tools||[]).map(tool=>({name:SAFE_TOOLS.has(tool.name)?tool.name:'unknown',ok:tool.ok===true})),review:{materials:numberOrNull(round.review?.materials),textBlocks:numberOrNull(round.review?.textBlocks),graphics:numberOrNull(round.review?.graphics),warningCount:round.review?.warnings?.length||0}})),
  outcome:['completed','failed','stopped','started'].includes(report.outcome)?report.outcome:'failed',stopReason:safeReason(report.stopReason||budget.stopReason||report.outcome),
  budget:{limit:numberOrNull(budget.limit),totalRequests:numberOrNull(budget.totalRequests),creationRequests:numberOrNull(budget.creationRequests),formatRepairRequests:numberOrNull(budget.formatRepairRequests),visualReviewRequests:numberOrNull(budget.visualReviewRequests)}
 };
}
export function redact(value,key='') {
  if(typeof value==='string')return (key?value.split(key).join('[REDACTED]'):value).replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/g,'[REDACTED]');
  if(Array.isArray(value))return value.map(v=>redact(v,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['authorization','key','apiKey','keys','token','headers'].includes(k)).map(([k,v])=>[k,redact(v,key)]));
  return value;
}
export async function createAIRecorder({db,model,key,request=fetch,storage=localStorage,accountId='browser',deviceRecords=localDeviceRecords}) {
  const enabled=storage.getItem(CAPTURE)==='true';
  let streamMetric;
  const session=enabled?{id:'ai-context-'+crypto.randomUUID(),model,createdAt:new Date().toISOString(),status:'running',complete:true,events:[],bytes:0}:null;
  const save=async event=>{
    if(!session)return;
    const cleaned=redact(event,key),size=new TextEncoder().encode(JSON.stringify(cleaned)).length;
    if(session.bytes+size>MAX_SESSION){session.complete=false;session.warning='达到单次 128 MiB 上限，后续正文未记录';}
    else {session.events.push(cleaned);session.bytes+=size;}
    try{await deviceRecords.put(accountId,structuredClone(session));}catch{session.complete=false;session.warning='记录保存失败，内容可能不完整';}
  };
  await save({type:'started',date:session?.createdAt});
  const recordMetric=async metric=>{
    try{const old=await deviceRecords.get(accountId,'ai-diagnostics');await deviceRecords.put(accountId,{id:'ai-diagnostics',entries:[...(old?.entries||[]),metric].slice(-100)});}catch{ /* Diagnostics cannot interrupt a valid design. */ }
  };
  return {
    async request(url,options) {
      const start=performance.now();let status=null,usage=null,succeeded=false;
      try {
        await save({type:'request',date:new Date().toISOString(),payload:JSON.parse(options.body)});
        const response=await request(url,options);status=response.status;
        if(response.headers.get('content-type')?.includes('text/event-stream')){
          succeeded=response.ok;
          streamMetric={date:new Date().toISOString(),stage:'创作',model,status,start};
          await save({type:'response-stream-started',status});
          return response;
        }
        const text=await response.clone().text();let data;try{data=JSON.parse(text);}catch{}
        usage=data?.usage; succeeded=response.ok;
        await save({type:'response',status,seconds:(performance.now()-start)/1000,body:data||text});
        return response;
      }catch(error){await save({type:'request-error',message:error.message});throw error;}
      finally{if(!streamMetric)await recordMetric({date:new Date().toISOString(),stage:'创作',model,status,succeeded,seconds:(performance.now()-start)/1000,inputTokens:usage?.prompt_tokens??null,outputTokens:usage?.completion_tokens??null,cachedTokens:usage?.prompt_tokens_details?.cached_tokens??null});}
    },
    async turn(turn,results,draft) {await save({type:'tools',turn,results,draft});},
    async response(data){await save({type:'response-stream-completed',body:data});if(streamMetric){const {start,...metric}=streamMetric;streamMetric=null;await recordMetric({...metric,succeeded:true,seconds:(performance.now()-start)/1000,inputTokens:data.usage?.prompt_tokens??null,outputTokens:data.usage?.completion_tokens??null,cachedTokens:data.usage?.prompt_tokens_details?.cached_tokens??null});}},
    async finish(status) {
      if(streamMetric){const {start,...metric}=streamMetric;streamMetric=null;await recordMetric({...metric,succeeded:false,seconds:(performance.now()-start)/1000,inputTokens:null,outputTokens:null,cachedTokens:null});}
      if(!session)return;session.status=status;session.endedAt=new Date().toISOString();await save({type:'ended',status});
      const sessions=(await deviceRecords.list(accountId,'ai-context-')).filter(x=>x.status!=='running').sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      let total=0;const discarded=[];sessions.forEach((s,i)=>{total+=s.bytes||0;if(i>=5||total>MAX_TOTAL)discarded.push(s.id);});
      if(discarded.length)await Promise.all(discarded.map(id=>deviceRecords.delete(accountId,id)));
    }
  };
}
function dialog(c,title) {
  c.body.innerHTML='<div class="dialog-head"><h2>'+title+'</h2><button type="button" class="btn" id="diagnostic-close">返回</button></div><div id="diagnostic-content" class="stack"></div>';
  c.body.querySelector('#diagnostic-close').onclick=()=>c.modal.close();if(!c.modal.open)c.modal.showModal();return c.body.querySelector('#diagnostic-content');
}
function action(label,fn){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=label;b.onclick=fn;return b;}
export async function showAIDiagnostics(c) {
  const content=dialog(c,'生成诊断'),entries=(await localDeviceRecords.get(c.state.accountId||'browser','ai-diagnostics'))?.entries||[];
  content.innerHTML='<p>最近 100 次请求的耗时、状态与 token 用量。诊断不包含图片、提示词、回复正文、地址或密钥。</p>';
  content.append(action('刷新',()=>showAIDiagnostics(c)),action('导出诊断',()=>c.download(new Blob([JSON.stringify(entries,null,2)],{type:'application/json'}),'拾页AI诊断.json')));
  if(!entries.length)content.insertAdjacentHTML('beforeend','<p>尚无生成记录。完成一次创作后可回到这里查看。</p>');
  for(const e of [...entries].reverse())content.insertAdjacentHTML('beforeend','<div class="rec-card diagnostic-row"><strong>'+c.esc(e.model)+'</strong><span>'+e.seconds.toFixed(1)+' 秒 · '+(e.succeeded?'请求成功':'未完成')+'</span><small>输入 '+(e.inputTokens??'—')+' · 输出 '+(e.outputTokens??'—')+' · 缓存 '+(e.cachedTokens??'—')+'</small><small>'+c.esc(e.date)+'</small></div>');
}
export async function showAIContexts(c) {
  const content=dialog(c,'创作完整上下文');
  content.innerHTML='<label class="toggle-row">记录完整创作上下文（含图片）<input type="checkbox" id="capture-context" '+(localStorage.getItem(CAPTURE)==='true'?'checked':'')+'></label><p>先开启，再重新发起创作。记录每轮提示词、工具合同、素材图片、实际回复与工具结果，不记录认证头或密钥。仅保留最近 5 次结束会话，单次 128 MiB、总计 512 MiB。已发生但没有记录的请求不能补回。</p>';
  content.querySelector('#capture-context').onchange=e=>{if(e.target.checked&&!confirm('开启完整上下文记录？记录可能包含素材照片、私人文字及服务返回的推理字段。')){e.target.checked=false;return;}localStorage.setItem(CAPTURE,String(e.target.checked));};
  content.append(action('刷新',()=>showAIContexts(c)));
  const sessions=(await localDeviceRecords.list(c.state.accountId||'browser','ai-context-')).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  if(!sessions.length)content.insertAdjacentHTML('beforeend','<p>暂无完整上下文记录。</p>');
  for(const s of sessions) {
    const row=document.createElement('div');row.className='diagnostic-row rec-card';
    row.innerHTML='<strong>'+c.esc(s.model)+'</strong><span>'+c.esc(s.createdAt)+' · '+c.esc(s.status)+'</span><small>'+s.events.length+' 个事件 · '+(s.bytes/1024/1024).toFixed(2)+' MiB'+(!s.complete?' · 记录不完整':'')+'</small>'+(s.warning?'<p>'+c.esc(s.warning)+'</p>':'');
    row.append(action('导出',()=>{if(confirm('导出包含照片和私人文字，请确认接收方可信。'))c.download(new Blob([JSON.stringify(s,null,2)],{type:'application/json'}),'拾页AI上下文-'+s.id+'.json');}));
    const remove=action('删除记录',async()=>{if(confirm('删除这次上下文记录？')){await localDeviceRecords.delete(c.state.accountId||'browser',s.id);showAIContexts(c);}});remove.disabled=s.status==='running';row.append(remove);content.append(row);
  }
}

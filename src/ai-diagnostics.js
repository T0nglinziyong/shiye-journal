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
  parameters:{generationMode:['agent','direct'].includes(parameters.generationMode)?parameters.generationMode:'unknown',temperature:numberOrNull(parameters.temperature),maxTokens:numberOrNull(parameters.maxTokens),materialCount:numberOrNull(parameters.materialCount)},
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

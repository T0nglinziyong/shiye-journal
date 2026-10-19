import {uploadCOSObject} from './cos-upload.js';
import {cloudApiUrl,cloudApiRequest} from './cloud-api-origin.js';
import {cloudEnabled} from './cloud-session.js';
const defaultFetch=(...args)=>cloudApiRequest(...args);
export function createCOSStore({client,enabled=false,endpoint=cloudApiUrl('/api/cos'),fetcher=defaultFetch,uploadRequest=fetcher===defaultFetch&&typeof XMLHttpRequest!=='undefined'?uploadCOSObject:null,sessionTimeoutMs=15000,ticketBatchDelayMs=8}){
  // CloudBase always uses the existing private COS bucket. A forgotten old
  // OBJECT_STORAGE toggle must not send image bytes to another provider.
  enabled=cloudEnabled||enabled;
  let pending=[],scheduled=false,activeWrites=0,activeReads=0,activePreviews=0;
  let reportOperation=()=>{};
  const waitingWrites=[],waitingPreviews=[];
  const writeLimit=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches?2:3;
  const report=(action,started,error,transfer)=>{try{reportOperation({action,kind:'image',durationMs:Date.now()-started,error,transfer:transfer||error?.transfer});}catch{/* Telemetry cannot stop a transfer. */}};
  // Derived previews are optional. Keep them behind original bytes and allow
  // at most one preview PUT to occupy the mobile upload lanes at a time.
  function pumpWrites(){while(activeWrites<writeLimit&&(!activeReads||activeWrites===0)){
    const original=waitingWrites.length>0;
    const job=original?waitingWrites.shift():activePreviews<1?waitingPreviews.shift():null;
    if(!job)break;
    activeWrites++;if(!original)activePreviews++;
    job().finally(()=>{activeWrites--;if(!original)activePreviews--;pumpWrites();});
  }}
  const scheduleWrite=(run,{preview=false}={})=>new Promise((resolve,reject)=>{
    (preview?waitingPreviews:waitingWrites).push(()=>Promise.resolve().then(run).then(resolve,reject));pumpWrites();
  });
  async function read(path,variant){activeReads++;try{const signed=await ticket(path,'GET',undefined,variant),response=await fetcher(signed.url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('COS '+(variant?'缩略图':'图片')+'读取失败（'+response.status+'）');return response.blob();}finally{activeReads--;pumpWrites();}}
  async function probe(path){activeReads++;try{const signed=await ticket(path,'GET'),response=await fetcher(signed.url,{headers:{Range:'bytes=0-0'},signal:AbortSignal.timeout(15000)});await response.body?.cancel?.();if(response.status===404)return false;if(!response.ok)throw Error('COS 图片核对失败（'+response.status+'）');return true;}finally{activeReads--;pumpWrites();}}
  // Image hashing finishes at slightly different times, so a microtask flush
  // often signed each sibling blob separately. A few milliseconds of batching
  // saves repeated session checks and /api/cos calls without signing queued
  // writes before their upload slot becomes available.
  const scheduleTickets=()=>{if(scheduled)return;scheduled=true;setTimeout(drain,ticketBatchDelayMs);};
  const ticket=(path,method,type,variant)=>new Promise((resolve,reject)=>{pending.push({path,method,type,variant,resolve,reject});scheduleTickets();});
  async function drain(){scheduled=false;const batch=pending.splice(0,24);if(pending.length)scheduleTickets();
    let sessionTimer;
    const started=Date.now();
    try{const {data,error}=await Promise.race([client().auth.getSession(),new Promise((_,reject)=>{
      sessionTimer=setTimeout(()=>{const failure=Error('图片上传等待登录会话超时；稍后自动重试');
        failure.status=503;reject(failure);},sessionTimeoutMs);
    })]);if(error||!data.session?.access_token)throw Error('请先登录');
      let result,lastError;for(let attempt=0;attempt<2;attempt++){
        try{const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({objects:batch.map(({path,method,type,variant})=>({path,method,type,variant}))}),signal:AbortSignal.timeout(attempt?30000:22000)});
          if(!response.ok){const failure=Object.assign(Error('COS 授权失败（'+response.status+'）；资料未改存到其他位置'),{status:response.status,requestId:response.headers?.get?.('X-Shiye-Request-Id')});if(response.status<500&&response.status!==429)throw Object.assign(failure,{nonRetryable:true});throw failure;}
          result=await response.json();break;
        }catch(failure){lastError=failure;if(failure.nonRetryable||attempt)throw failure;}
      }
      if(!result)throw lastError;
      for(const row of batch){const signed=result.tickets?.find(t=>t.path===row.path&&t.method===row.method&&t.variant===row.variant);if(!signed||!signed.url.startsWith('https://'))throw Error('COS 签名结果无效');}
      report('cos-ticket',started);
      batch.forEach(row=>row.resolve(result.tickets.find(t=>t.path===row.path&&t.method===row.method&&t.variant===row.variant)));
    }catch(error){report('cos-ticket-failed',started,error);batch.forEach(row=>row.reject(error));}
    finally{clearTimeout(sessionTimer);}
  }
  return {enabled,setDiagnosticReporter:callback=>{reportOperation=typeof callback==='function'?callback:()=>{};},
    download:path=>read(path),
    probe,
    preview:(path,variant='preview480')=>read(path,variant),
    upload:(path,blob,type=blob.type||'application/octet-stream')=>scheduleWrite(async()=>{
      // Small images should not occupy an upload lane for two minutes when a
      // TCP route stalls. Larger files keep a size-proportional allowance.
      const timeoutMs=Math.min(120000,Math.max(30000,
        Math.ceil((blob.size||0)/32768)*1000));
      for(let attempt=0;attempt<2;attempt++){
        const signed=await ticket(path,'PUT',type),started=Date.now();
        try{
          const response=uploadRequest?await uploadRequest(signed.url,{headers:signed.headers,body:blob,
            idleTimeoutMs:30000,totalTimeoutMs:Math.max(120000,Math.min(600000,timeoutMs*5))}):
            await fetcher(signed.url,{method:'PUT',headers:signed.headers,body:blob,signal:AbortSignal.timeout(timeoutMs)});
          if(!response.ok&&response.status!==409){
            const failure=Error('COS 上传失败（'+response.status+'）；未保存元数据');
            failure.status=response.status;failure.transfer=response.transfer;throw failure;
          }
          report('cos-put',started,null,response.transfer);return;
        }catch(error){
          report('cos-put-failed',started,error);
          const status=Number(error?.status),retryable=!status||status===429||status>=500;
          // The PUT may have reached COS while its response was lost. Hash paths
          // are immutable; an existing object is the same acknowledgement as 409.
          if(!status){try{if(await probe(path)){report('cos-put-verified',started,null,error.transfer);return;}}catch{/* Preserve the original failure; retry later. */}}
          if(attempt||!retryable)throw error;
        }
      }
    },{preview:path.endsWith('-preview480.webp')}),
  };
}

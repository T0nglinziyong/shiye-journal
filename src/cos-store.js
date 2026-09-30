export function createCOSStore({client,enabled=false,endpoint='/api/cos',fetcher=(...args)=>fetch(...args)}){
  let pending=[],scheduled=false,activeWrites=0,activeReads=0;
  const waitingWrites=[];
  const writeLimit=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches?2:3;
  function pumpWrites(){while(waitingWrites.length&&activeWrites<writeLimit&&(!activeReads||activeWrites===0)){const job=waitingWrites.shift();activeWrites++;job().finally(()=>{activeWrites--;pumpWrites();});}}
  const scheduleWrite=run=>new Promise((resolve,reject)=>{waitingWrites.push(()=>Promise.resolve().then(run).then(resolve,reject));pumpWrites();});
  async function read(path,variant){activeReads++;try{const signed=await ticket(path,'GET',undefined,variant),response=await fetcher(signed.url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('COS '+(variant?'缩略图':'图片')+'读取失败（'+response.status+'）');return response.blob();}finally{activeReads--;pumpWrites();}}
  const ticket=(path,method,type,variant)=>new Promise((resolve,reject)=>{pending.push({path,method,type,variant,resolve,reject});if(!scheduled){scheduled=true;queueMicrotask(drain);}});
  async function drain(){scheduled=false;const batch=pending.splice(0,24);if(pending.length){scheduled=true;queueMicrotask(drain);}
    try{const {data,error}=await client().auth.getSession();if(error||!data.session?.access_token)throw Error('请先登录');
      let result,lastError;for(let attempt=0;attempt<2;attempt++){
        try{const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({objects:batch.map(({path,method,type,variant})=>({path,method,type,variant}))}),signal:AbortSignal.timeout(attempt?22000:8000)});
          if(!response.ok){const failure=Error('COS 授权失败（'+response.status+'）；资料未改存到其他位置');if(response.status<500&&response.status!==429)throw Object.assign(failure,{nonRetryable:true});throw failure;}
          result=await response.json();break;
        }catch(failure){lastError=failure;if(failure.nonRetryable||attempt)throw failure;}
      }
      if(!result)throw lastError;
      for(const row of batch){const signed=result.tickets?.find(t=>t.path===row.path&&t.method===row.method&&t.variant===row.variant);if(!signed||!signed.url.startsWith('https://'))throw Error('COS 签名结果无效');}
      batch.forEach(row=>row.resolve(result.tickets.find(t=>t.path===row.path&&t.method===row.method&&t.variant===row.variant)));
    }catch(error){batch.forEach(row=>row.reject(error));}
  }
  return {enabled,
    download:path=>read(path),
    preview:path=>read(path,'preview360'),
    upload:(path,blob,type=blob.type||'application/octet-stream')=>scheduleWrite(async()=>{const signed=await ticket(path,'PUT',type),response=await fetcher(signed.url,{method:'PUT',headers:signed.headers,body:blob,signal:AbortSignal.timeout(120000)});if(!response.ok&&response.status!==409)throw Error('COS 上传失败（'+response.status+'）；未保存元数据');}),
  };
}

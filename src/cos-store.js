export function createCOSStore({client,enabled=false,endpoint='/api/cos',fetcher=(...args)=>fetch(...args)}){
  let pending=[],scheduled=false;
  const ticket=(path,method,type)=>new Promise((resolve,reject)=>{pending.push({path,method,type,resolve,reject});if(!scheduled){scheduled=true;queueMicrotask(drain);}});
  async function drain(){scheduled=false;const batch=pending.splice(0,24);if(pending.length){scheduled=true;queueMicrotask(drain);}
    try{const {data,error}=await client().auth.getSession();if(error||!data.session?.access_token)throw Error('请先登录');
      const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({objects:batch.map(({path,method,type})=>({path,method,type}))}),signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error('COS 授权失败（'+response.status+'）；资料未改存到其他位置');const result=await response.json();
      for(const row of batch){const signed=result.tickets?.find(t=>t.path===row.path&&t.method===row.method);if(!signed||!signed.url.startsWith('https://'))throw Error('COS 签名结果无效');}
      batch.forEach(row=>row.resolve(result.tickets.find(t=>t.path===row.path&&t.method===row.method)));
    }catch(error){batch.forEach(row=>row.reject(error));}
  }
  return {enabled,
    async download(path){const signed=await ticket(path,'GET'),response=await fetcher(signed.url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('COS 图片读取失败（'+response.status+'）');return response.blob();},
    async upload(path,blob,type=blob.type||'application/octet-stream'){const signed=await ticket(path,'PUT',type),response=await fetcher(signed.url,{method:'PUT',headers:signed.headers,body:blob,signal:AbortSignal.timeout(120000)});if(!response.ok&&response.status!==409)throw Error('COS 上传失败（'+response.status+'）；未保存元数据');},
  };
}

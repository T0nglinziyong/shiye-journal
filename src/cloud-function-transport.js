// The browser calls one authenticated CloudBase event function. No hosting
// origin proxy is involved. COS file transfers still use their signed URL.
export const CLOUD_API_ROUTES=Object.freeze({
  '/api/cos':'POST',
  '/api/platform-health':'GET',
  '/api/storage-usage':'GET',
  '/api/search':'POST',
  '/api/search-index':'POST',
  '/api/telemetry':'POST',
  '/api/account-reset':'POST'
});
const failed=(message,status,code)=>Object.assign(Error(message),{status,code});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function withRequestDeadline(task,{signal,timeoutMs=30000}={}){
  if(signal?.aborted)return Promise.reject(signal.reason||new DOMException('请求已取消','AbortError'));
  return new Promise((resolve,reject)=>{
    let settled=false,timer;
    const finish=(fn,value)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      signal?.removeEventListener('abort',onAbort);fn(value);
    };
    const onAbort=()=>finish(reject,signal.reason||new DOMException('请求已取消','AbortError'));
    signal?.addEventListener('abort',onAbort,{once:true});
    timer=setTimeout(()=>finish(reject,failed('CloudBase 服务响应超时；本机资料仍保留',504,'SHIYE_API_TIMEOUT')),timeoutMs);
    // Attach both handlers even when the caller cancels; a function which is
    // already running can finish later and must not leak an unhandled rejection.
    Promise.resolve().then(task).then(value=>finish(resolve,value),error=>finish(reject,error));
  });
}

export function createCloudFunctionTransport({invoke,getSession,network=(...args)=>fetch(...args),
  functionName='shiye-api',timeoutMs=30000}={}){
  if(typeof invoke!=='function'||typeof getSession!=='function')throw TypeError('CloudBase 调用器未配置');
  return async function request(input,init={}){
    const inputRequest=typeof Request!=='undefined'&&input instanceof Request?input:null;
    const url=inputRequest?inputRequest.url:String(input);
    // Only explicit, relative business API routes are converted. In particular
    // do not send signed COS URLs or third-party model payloads to the function.
    if(!url.startsWith('/api/'))return network(input,init);
    if(!Object.hasOwn(CLOUD_API_ROUTES,url))throw failed('未知 CloudBase 业务接口',404,'SHIYE_API_ROUTE');
    const method=String(init.method||inputRequest?.method||'GET').toUpperCase();
    if(method!==CLOUD_API_ROUTES[url])throw failed('此接口不支持该请求方法',405,'SHIYE_API_METHOD');
    const signal=init.signal||inputRequest?.signal;
    return withRequestDeadline(async()=>{
      if(signal?.aborted)throw signal.reason||new DOMException('请求已取消','AbortError');
      const headers=new Headers(init.headers||inputRequest?.headers);
      let authorization=headers.get('Authorization');
      if(!authorization){
        const session=await getSession();
        if(session?.error||!session?.data?.session?.access_token)
          throw failed('登录会话已失效，请重新登录',401,'SHIYE_AUTH_REQUIRED');
        authorization='Bearer '+session.data.session.access_token;
      }
      if(!/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(authorization))
        throw failed('登录凭据无效',401,'SHIYE_AUTH_REQUIRED');
      let body=null;
      if(init.body!=null){
        if(typeof init.body!=='string')throw failed('业务接口只接受 JSON，不接收图片字节',400,'SHIYE_API_BODY');
        if(new TextEncoder().encode(init.body).byteLength>262144)
          throw failed('业务请求过大；图片应直接上传 COS',413,'SHIYE_API_SIZE');
        try{body=JSON.parse(init.body);}catch{throw failed('业务请求不是有效 JSON',400,'SHIYE_API_BODY');}
        if(!object(body))throw failed('业务请求必须是 JSON 对象',400,'SHIYE_API_BODY');
      }
      if(signal?.aborted)throw signal.reason||new DOMException('请求已取消','AbortError');
      const response=await invoke({name:functionName,data:{version:1,route:url,method,authorization,body},parse:true});
      if(response?.code)throw failed('CloudBase 云函数调用失败，请检查函数部署和调用权限',503,'SHIYE_FUNCTION_UNAVAILABLE');
      let result=response?.result;
      if(typeof result==='string'){
        try{result=JSON.parse(result);}catch{throw failed('CloudBase 返回内容无法解析',502,'SHIYE_API_RESPONSE');}
      }
      if(!object(result)||result.version!==1||!Number.isInteger(result.status)||
        result.status<200||result.status>599||!object(result.body))
        throw failed('CloudBase 返回格式不符合当前协议',502,'SHIYE_API_RESPONSE');
      const outputHeaders={'Content-Type':'application/json;charset=utf-8','Cache-Control':'private, no-store'};
      if(typeof result.requestId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(result.requestId))
        outputHeaders['X-Shiye-Request-Id']=result.requestId;
      return new Response([204,205,304].includes(result.status)?null:JSON.stringify(result.body),
        {status:result.status,headers:outputHeaders});
    },{signal,timeoutMs});
  };
}

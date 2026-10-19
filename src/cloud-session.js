import {createClient} from '@supabase/supabase-js';
import {cloudApiUrl} from './cloud-api-origin.js';

const url=import.meta.env?.VITE_SHIYE_SUPABASE_URL;
const key=import.meta.env?.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY;
const cloudbaseEnv=import.meta.env?.VITE_SHIYE_CLOUDBASE_ENV_ID;
const cloudbaseKey=import.meta.env?.VITE_SHIYE_CLOUDBASE_PUBLISHABLE_KEY;
export const cloudbaseEnabled=!!cloudbaseEnv;
export const cloudEnabled=cloudbaseEnabled||!!url;
let client;
let preparing;
export async function prepareCloudClient(){
  if(!cloudbaseEnabled||client)return;
  if(!cloudbaseKey)throw Error('CloudBase 浏览器公钥未配置；未切换到本机存储');
  preparing??=(async()=>{
    const [{default:cloudbase},{registerAuth},{registerMySQL}]=await Promise.all([
      import('@cloudbase/js-sdk/app'),import('@cloudbase/js-sdk/auth'),
      import('@cloudbase/js-sdk/mysql')]);
    registerAuth(cloudbase);
    registerMySQL(cloudbase);
    const app=cloudbase.init({env:cloudbaseEnv,accessKey:cloudbaseKey});
    // Keep installed test PWAs on their original origin. CloudBase's trial
    // environment does not accept that origin for direct browser requests.
    // Direct browser CloudBase transport is opt-in: CloudBase must authorize
    // the site's origin before the default Vercel compatibility proxy is removed.
    if(location.hostname.endsWith('.vercel.app')&&
      import.meta.env?.VITE_SHIYE_CLOUDBASE_DIRECT!=='true')app.registerEndPointWithKey({
      key:'GATEWAY',url:`//${location.host}`,protocol:location.protocol,
    });
    const db=app.rdb();
    const auth=typeof app.auth==='function'?app.auth():app.auth;
    client={auth,from:table=>db.from(table),rpc:(name,args)=>db.rpc(name,args)};
  })();
  try{await preparing;}finally{preparing=null;}
}
export async function fetchCloudRequest(input,init,{fetcher=fetch,commitTimeoutMs=20000,
  relayTimeoutMs=25000}={}){
  const path=input instanceof Request?input.url:String(input);
  const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  const storage=/\/storage\/v1\/object\//.test(path);
  const authentication=/\/auth\/v1\/|\/rest\/v1\/shiye_accounts(?:\?|$)/.test(path);
  const commit=method==='POST'&&/\/rest\/v1\/rpc\/shiye_commit_v3_guarded(?:\?|$)/.test(path);
  const timeout=storage?['POST','PUT','PATCH'].includes(method)?180000:90000:
    authentication?12000:commit?commitTimeoutMs:30000;
  const deadline=AbortSignal.timeout(timeout);
  try{return await fetcher(input,{...init,signal:init?.signal?
    AbortSignal.any([init.signal,deadline]):deadline});}
  catch(error){
    const transient=deadline.aborted||error?.name==='TypeError'||error?.name==='NetworkError';
    const body=init?.body;
    if(!commit||!transient||init?.signal?.aborted||typeof window==='undefined'||
      typeof body!=='string'||new Blob([body]).size>3_500_000)throw error;
    // A lost direct response may already have committed. The operation ID is
    // unchanged, so the server receipt makes this relay attempt idempotent.
    const relaySignal=AbortSignal.timeout(relayTimeoutMs);
    return fetcher(cloudApiUrl('/api/sync-commit'),{method:'POST',headers:init?.headers,
      body,cache:'no-store',signal:init?.signal?
        AbortSignal.any([init.signal,relaySignal]):relaySignal});
  }
}
async function authStep(promise,message){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>{const error=Error(message);error.status=503;reject(error);},15000);
  })]);}
  finally{clearTimeout(timer);}
}
export function cloudClient(){
  if(cloudbaseEnabled){
    if(!client)throw Error('CloudBase 尚未初始化；请重试登录');
    return client;
  }
  if(!url||!key)throw Error('云端配置不完整；未切换到本机存储');
  return client??=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},global:{fetch:fetchCloudRequest}});
}
export async function requireCloudUser({withAccount=false}={}){
  const {data,error}=await authStep(cloudClient().auth.getUser(),
    '登录验证服务响应超时，请重试连接；已保留登录会话');
  if(error||!data.user){
    const signedOut=!error||error.status===401||error.name==='AuthSessionMissingError';
    const e=Error(signedOut?'请先登录拾页':'登录验证服务暂时不可用，请重试连接');
    e.status=signedOut?401:error.status||503;e.code=error?.code;e.cause=error;throw e;
  }
  const allowed=await authStep(cloudClient().from('shiye_accounts').select(withAccount?'user_id,username,is_admin':'user_id').eq('user_id',data.user.id).maybeSingle(),
    '云端账号核验响应超时，请重试连接；已保留登录会话');
  if(allowed.error){
    const e=Error('云端账号核验暂时不可用，请重试连接；已保留登录会话');
    e.status=allowed.status;e.code=allowed.error.code;e.cause=allowed.error;throw e;
  }
  if(!allowed.data){const e=Error('此账号未获测试权限');e.status=403;throw e;}
  return withAccount?{user:data.user,account:allowed.data}:data.user;
}

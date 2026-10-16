import {createClient} from '@supabase/supabase-js';

const url=import.meta.env?.VITE_SHIYE_SUPABASE_URL;
const key=import.meta.env?.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY;
export const cloudEnabled=!!url;
let client;
export function cloudClient(){
  if(!url||!key)throw Error('云端配置不完整；未切换到本机存储');
  return client??=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
    const path=input instanceof Request?input.url:String(input),method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
    const storage=/\/storage\/v1\/object\//.test(path),timeout=storage?['POST','PUT','PATCH'].includes(method)?180000:90000:30000;
    return fetch(input,{...init,signal:init?.signal||AbortSignal.timeout(timeout)});
  }}});
}
export async function requireCloudUser({withAccount=false}={}){
  const {data,error}=await cloudClient().auth.getUser();
  if(error||!data.user){
    const signedOut=!error||error.status===401||error.name==='AuthSessionMissingError';
    const e=Error(signedOut?'请先登录拾页':'登录验证服务暂时不可用，请重试连接');
    e.status=signedOut?401:error.status||503;e.code=error?.code;e.cause=error;throw e;
  }
  const allowed=await cloudClient().from('shiye_accounts').select(withAccount?'user_id,username,is_admin':'user_id').eq('user_id',data.user.id).maybeSingle();
  if(allowed.error){
    const e=Error('云端账号核验暂时不可用，请重试连接；已保留登录会话');
    e.status=allowed.status;e.code=allowed.error.code;e.cause=allowed.error;throw e;
  }
  if(!allowed.data){const e=Error('此账号未获测试权限');e.status=403;throw e;}
  return withAccount?{user:data.user,account:allowed.data}:data.user;
}

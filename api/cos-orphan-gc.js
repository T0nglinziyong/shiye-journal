import COS from 'cos-nodejs-sdk-v5';
import {createClient} from '@supabase/supabase-js';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {sweepCosOrphans} from '../server/cos-orphan-gc-worker.mjs';

export const config={maxDuration:60};
const safeEqual=(left,right)=>{
  const a=Buffer.from(left||''),b=Buffer.from(right||'');
  return a.length>0&&a.length===b.length&&timingSafeEqual(a,b);
};
const send=(res,status,body)=>{res.setHeader('Cache-Control','private, no-store');return res.status(status).json(body);};

// Cron is authenticated independently of user sessions. The server chooses
// the account and every COS path; the browser has no delete or GC ticket.
export default async function handler(req,res){
  if(req.method!=='GET')return send(res,405,{error:'仅支持定时任务'});
  const env=process.env;
  if(env.VITE_SHIYE_CLOUDBASE_ENV_ID)
    return send(res,200,{scannedAccounts:0,actions:0,skipped:'cloudbase-migration'});
  if(!env.CRON_SECRET||!safeEqual(req.headers.authorization,'Bearer '+env.CRON_SECRET))
    return send(res,401,{error:'定时任务未授权'});
  if(env.VERCEL_GIT_COMMIT_REF!=='test'&&env.SHIYE_COS_ORPHAN_GC_PRODUCTION!=='true')
    return send(res,403,{error:'此部署未启用图片回收'});
  if(!env.VITE_SHIYE_SUPABASE_URL||!env.SHIYE_SUPABASE_SERVICE_ROLE_KEY||
    !env.SHIYE_COS_SECRET_ID||!env.SHIYE_COS_SECRET_KEY||
    !env.SHIYE_COS_BUCKET||!env.SHIYE_COS_REGION)
    return send(res,503,{error:'服务端图片回收配置不完整'});
  const client=createClient(env.VITE_SHIYE_SUPABASE_URL,
    env.SHIYE_SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const {count,error:countError}=await client.from('shiye_accounts')
      .select('user_id',{count:'exact',head:true});
    if(countError||!Number.isSafeInteger(count))throw Error('账号列表不可用');
    if(!count)return send(res,200,{scannedAccounts:0,actions:0});
    // One account per bounded invocation. The hour index rotates across users;
    // an account with an incomplete inventory simply waits for a later run.
    const offset=Math.floor(Date.now()/3600000)%count;
    const {data,error}=await client.from('shiye_accounts').select('user_id')
      .order('user_id').range(offset,offset);
    if(error||data?.length!==1)throw Error('账号选择不完整');
    const user=data[0].user_id,deleteEnabled=env.SHIYE_COS_ORPHAN_GC_DELETE_ENABLED==='true',
      lease=deleteEnabled?randomUUID():null;
    if(lease){
      const {data:claimed,error:claimError}=await client.rpc('shiye_gc_claim',
        {p_user:user,p_lease:lease});
      if(claimError)throw Error('图片回收租约不可用');
      if(!claimed)return send(res,200,{scannedAccounts:0,skipped:'already-running'});
    }
    let result;
    try{
      const cos=new COS({SecretId:env.SHIYE_COS_SECRET_ID,SecretKey:env.SHIYE_COS_SECRET_KEY});
      result=await sweepCosOrphans({client,cos,user,
        bucket:env.SHIYE_COS_BUCKET,region:env.SHIYE_COS_REGION,
        deleteEnabled});
    }finally{
      if(lease){
        const {error:releaseError}=await client.rpc('shiye_gc_release',
          {p_user:user,p_lease:lease});
        if(releaseError)console.error('COS orphan GC lease release failed');
      }
    }
    console.info('COS orphan GC',JSON.stringify({...result,account:'redacted'}));
    return send(res,200,{scannedAccounts:1,...result});
  }catch(error){
    console.error('COS orphan GC paused',error?.name||'Error');
    return send(res,503,{error:'图片安全核验未完成；本轮未继续清理'});
  }
}

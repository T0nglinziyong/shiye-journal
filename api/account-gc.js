import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
import {processGc,readGcMarker,assertGcScope} from '../server/account-gc-worker.mjs';

export const config={maxDuration:30};
const reply=(res,status,body)=>{res.setHeader('Cache-Control','private, no-store');return res.status(status).json(body);};
const constantTimeEqual=(a,b)=>{
 const x=Buffer.from(a||''),y=Buffer.from(b||'');
 return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);
};
export default async function handler(req,res){
 const env=process.env;
 if(env.VERCEL_GIT_COMMIT_REF!=='test'&&env.SHIYE_ACCOUNT_GC_ENABLED!=='true')
   return reply(res,403,{error:'该部署未启用后台垃圾回收'});
 if(!['GET','POST'].includes(req.method))return reply(res,405,{error:'method not allowed'});
 if(!env.VITE_SHIYE_SUPABASE_URL||!env.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY)
   return reply(res,503,{error:'Supabase 环境未配置'});
 let client,users=[];
 if(req.method==='GET'){
   // Vercel Cron only; never accept a secret in a URL or from the browser.
   if(!env.CRON_SECRET||!constantTimeEqual(req.headers.authorization,'Bearer '+env.CRON_SECRET))
     return reply(res,401,{error:'Cron 未授权'});
   if(!env.SHIYE_SUPABASE_SERVICE_ROLE_KEY)
     return reply(res,503,{error:'后台任务缺少 SHIYE_SUPABASE_SERVICE_ROLE_KEY'});
   client=createClient(env.VITE_SHIYE_SUPABASE_URL,
     env.SHIYE_SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const {data,error}=await client.from('shiye_records').select('user_id,record')
      .eq('store','meta').eq('id','shiye-reset-barrier').limit(20);
   if(error)return reply(res,503,{error:'无法读取待清理任务'});
   users=(data||[]).filter(row=>row.record?.phase==='deleting').map(row=>row.user_id);
 }else{
   const token=/^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(req.headers.authorization||'')?.[1];
   if(!token)return reply(res,401,{error:'请先登录'});
   // The user can request one server-side cleanup pass, but cannot select
   // arbitrary other accounts or object paths.
   const authClient=createClient(env.VITE_SHIYE_SUPABASE_URL,
     env.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY,{
       auth:{persistSession:false,autoRefreshToken:false},
       global:{headers:{Authorization:'Bearer '+token}}
     });
   const {data,error}=await authClient.auth.getUser(token);
   if(error||!data.user)return reply(res,401,{error:'会话失效'});
   const user=data.user.id;
   const {data:account,error:allowedError}=await authClient.from('shiye_accounts')
     .select('user_id').eq('user_id',user).maybeSingle();
   if(allowedError||!account)return reply(res,403,{error:'当前账号无权清理资料'});
   if(!env.SHIYE_SUPABASE_SERVICE_ROLE_KEY)
     return reply(res,503,{error:'后台任务尚未配置服务端数据权限'});
   client=createClient(env.VITE_SHIYE_SUPABASE_URL,
     env.SHIYE_SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   users=[user];
 }
 const results=[];
 for(const user of users.slice(0,10)){
   try{
     const marker=await readGcMarker(client,user);
     if(!marker||marker.phase!=='deleting')continue;
     assertGcScope(user,marker);
     // Keep each serverless invocation bounded. The durable marker stores
     // progress, so interruption cannot lose work or require the browser.
     const result=await processGc({client,user,env,maxBatches:4,deadlineMs:22000});
     results.push({phase:result.phase,complete:result.complete,
       processed:result.processed||0});
   }catch(error){
     console.error('Shiye account GC worker:',error?.message);
     results.push({error:'后台图片清理待重试'});
   }
 }
 return reply(res,200,{checked:users.length,results});
}

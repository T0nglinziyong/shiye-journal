import {createClient} from '@supabase/supabase-js';
import {validResetId} from './_lib/account-gc.js';

// Account reset is ONLY a fast logical transaction. Physical COS and
// Supabase Storage deletion is handled by the independent scheduled worker.
export const config={maxDuration:30};
const out=(res,code,body)=>{res.setHeader('Cache-Control','private, no-store');return res.status(code).json(body);};
export default async function handler(req,res){
 if(req.method!=='POST')return out(res,405,{error:'只允许 POST'});
 const env=process.env;
 if(env.VERCEL_GIT_COMMIT_REF!=='test'&&env.SHIYE_ACCOUNT_RESET_ENABLED!=='true')
   return out(res,403,{error:'当前部署未启用账号清理'});
 const token=/^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(req.headers.authorization||'')?.[1];
 if(!token)return out(res,401,{error:'请先登录'});
 if(!env.VITE_SHIYE_SUPABASE_URL||!env.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY)
   return out(res,503,{error:'身份服务未配置'});
 const cloud=createClient(env.VITE_SHIYE_SUPABASE_URL,
   env.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY,{
     auth:{persistSession:false,autoRefreshToken:false},
     global:{headers:{Authorization:'Bearer '+token}}
   });
 try{
   const {data:identity,error:authError}=await cloud.auth.getUser(token);
   if(authError||!identity.user||identity.user.is_anonymous)return out(res,401,{error:'登录已失效'});
   const user=identity.user.id;
   const {data:account,error:permissionError}=await cloud.from('shiye_accounts')
     .select('user_id').eq('user_id',user).maybeSingle();
   if(permissionError||!account)return out(res,403,{error:'此账号无权执行清理'});
   const {data:stored,error:readError}=await cloud.from('shiye_records')
     .select('record').eq('user_id',user).eq('store','meta')
     .eq('id','shiye-reset-barrier').maybeSingle();
   if(readError)throw Error('无法读取账号状态');
   const marker=stored?.record||null;
   if(req.body?.mode==='probe')
     return out(res,200,{ready:true,phase:marker?.phase||null,resetId:marker?.resetId||null});
   if(req.body?.mode!=='start'||req.body?.confirm!=='RESET_MY_DATA'||
      !validResetId(req.body?.resetId))
     return out(res,400,{error:'请在网页中二次确认账号清理'});
   if(marker?.phase==='deleting')
     return out(res,202,{accepted:true,phase:'deleting',databaseCleared:true,
       resetId:marker.resetId,queued:true});
   if(marker?.resetId===req.body.resetId&&marker.phase==='complete')
     return out(res,200,{accepted:true,phase:'complete',databaseCleared:true,
       resetId:marker.resetId,queued:false});
   // Never clear a user's metadata if there is no independent worker
   // capable of completing physical object deletion.
   const ready=env.SHIYE_COS_SECRET_ID&&env.SHIYE_COS_SECRET_KEY&&
     env.SHIYE_COS_BUCKET&&env.SHIYE_COS_REGION&&
     env.SHIYE_SUPABASE_SERVICE_ROLE_KEY&&env.CRON_SECRET;
   if(!ready)return out(res,503,{error:'服务端自动清理任务尚未正确配置；数据库未改动'});
   const {data:rev,error:versionError}=await cloud.from('shiye_revisions')
      .select('revision').eq('user_id',user).single();
   if(versionError)throw Error('无法读取云端数据版本');
   const revision=Number(rev.revision),resetId=req.body.resetId;
   const record={id:'shiye-reset-barrier',phase:'deleting',resetId,
     revision:revision+1,createdAt:new Date().toISOString()};
   const operations=['assets','blobs','series','projects','meta','trash']
      .map(store=>({store,action:'clear'}));
   operations.push({store:'meta',action:'put',item:record});
   const {error}=await cloud.rpc('shiye_commit_v2',{
     operations,expected_revision:revision,operation_id:resetId
   });
   if(error)throw Error('其他设备正在修改资料，未清空云端数据：'+error.message);
   // Persisted "deleting" marker is the durable job. The scheduled server
   // worker will finish even if the browser closes immediately.
   return out(res,202,{accepted:true,phase:'deleting',databaseCleared:true,
     resetId,queued:true});
 }catch(error){
   console.warn('Account reset init failed:',error?.message);
   return out(res,503,{error:'账号清空尚未开始：'+(error?.message||'稍后重试')});
 }
}

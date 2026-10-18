import COS from 'cos-nodejs-sdk-v5';
import {createClient} from '@supabase/supabase-js';
import {createDevReset} from '../server/dev-reset.mjs';
export const config={maxDuration:30};
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'只允许 POST'});
  const env=process.env;
  if(env.VITE_SHIYE_CLOUDBASE_ENV_ID)
    return res.status(503).json({error:'CloudBase 开发清理尚未配置，未改动任何数据'});
  const enabled=env.SHIYE_DEV_CLEANUP_ENABLED==='true'&&
    env.VERCEL_ENV==='preview'&&
    !!(env.SHIYE_COS_SECRET_ID&&env.SHIYE_COS_SECRET_KEY&&env.SHIYE_COS_BUCKET&&env.SHIYE_COS_REGION);
  if(!enabled)return res.status(403).json({error:'此接口仅在显式启用的预览环境提供'});
  const client=new COS({SecretId:env.SHIYE_COS_SECRET_ID,SecretKey:env.SHIYE_COS_SECRET_KEY});
  const params={Bucket:env.SHIYE_COS_BUCKET,Region:env.SHIYE_COS_REGION};
  const authClient=token=>createClient(env.VITE_SHIYE_SUPABASE_URL,
    env.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},
      global:{headers:{Authorization:'Bearer '+token}}});
  const api=createDevReset({
    enabled,
    authenticate:async token=>{
      const supabase=authClient(token);
      const {data,error}=await supabase.auth.getUser(token);
      if(error||!data.user||data.user.is_anonymous)return null;
      const account=await supabase.from('shiye_accounts').select('is_admin').eq('user_id',data.user.id).maybeSingle();
      if(account.error)return null;
      return {id:data.user.id,isAdmin:account.data?.is_admin===true};
    },
    cos:{
      list:async(prefix,MaxKeys)=>{
        const response=await client.getBucket({...params,Prefix:prefix,MaxKeys});
        return (response.Contents||[]).map(object=>object.Key);
      },
      remove:async keys=>{
        const result=await client.deleteMultipleObject({...params,Objects:keys.map(Key=>({Key})),Quiet:false});
        if(result.Error?.length)throw Error('COS 部分文件删除失败，请重新执行清理');
      }
    },
    resetRecords:async token=>{
      const supabase=authClient(token),account=await supabase.auth.getUser(token);
      if(account.error||!account.data.user)throw Error('登录状态已失效');
      const revision=await supabase.from('shiye_revisions').select('revision,account_epoch').eq('user_id',account.data.user.id).single();
      if(revision.error)throw revision.error;
      const operations=['assets','blobs','series','projects','meta','trash'].map(store=>({store,action:'clear'}));
      const response=await supabase.rpc('shiye_commit_v3',{operations,
        base_revision:Number(revision.data.revision),operation_id:crypto.randomUUID(),
        expected_epoch:revision.data.account_epoch,sync_protocol_version:3});
      if(response.error)throw response.error;
    }
  });
  try{
    const result=await api({method:req.method,authorization:req.headers.authorization,confirm:req.body?.confirm,mode:req.body?.mode});
    return res.status(result.status).json(result.error?{error:result.error}:{ready:result.ready||false,deleted:result.deleted||0,more:result.more||false,reset:result.reset||false});
  }catch(error){
    console.warn('Development reset interrupted',error?.message);
    return res.status(503).json({error:'开发数据清理未完成，可重试：'+(error?.message||'请求失败')});
  }
}

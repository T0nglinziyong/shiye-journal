import COS from 'cos-nodejs-sdk-v5';
import {createClient} from '@supabase/supabase-js';
import {trustedOrigins} from '../server/trusted-origins.mjs';
import {collectCOSReferencePaths,summarizeCOSInventory} from '../server/storage-usage.mjs';

// Server-side, administrator-only and READ ONLY. Never return COS credentials,
// object URLs, original filenames, or a delete capability to the browser.
export const config={maxDuration:60};

const cosList=(cos,env,marker)=>new Promise((resolve,reject)=>{
  cos.getBucket({Bucket:env.SHIYE_COS_BUCKET,Region:env.SHIYE_COS_REGION,
    Prefix:'',MaxKeys:1000,...(marker?{Marker:marker}:{})},
  (error,data)=>error?reject(error):resolve(data));
});

export default async function handler(req,res){
  const send=(status,body)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Origin');return res.status(status).json(body);};
  if(req.method!=='GET')return send(405,{error:'仅支持查询'});
  const env=process.env;
  if(env.VITE_SHIYE_CLOUDBASE_ENV_ID)
    return send(503,{error:'CloudBase 容量统计尚未配置'});
  const origins=trustedOrigins(env);
  if(req.headers.origin&&!origins.includes(req.headers.origin))return send(403,{error:'来源不允许'});
  const token=/^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(req.headers.authorization||'')?.[1];
  if(!token)return send(401,{error:'请先登录'});
  if(!env.VITE_SHIYE_SUPABASE_URL||!env.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY)return send(503,{error:'Supabase 未配置'});
  if(!env.SHIYE_COS_SECRET_ID||!env.SHIYE_COS_SECRET_KEY||!env.SHIYE_COS_BUCKET||!env.SHIYE_COS_REGION)
    return send(503,{error:'COS 管理端未配置；数据库统计仍可独立查看'});
  try{
    const client=createClient(env.VITE_SHIYE_SUPABASE_URL,env.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY,{
      auth:{persistSession:false,autoRefreshToken:false},
      global:{headers:{Authorization:'Bearer '+token},fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(18000)})}
    });
    const identity=await client.auth.getUser(token);
    if(identity.error||!identity.data?.user||identity.data.user.is_anonymous)return send(401,{error:'登录已失效'});
    const {data:role,error:roleError}=await client.from('shiye_accounts').select('is_admin')
      .eq('user_id',identity.data.user.id).single();
    if(roleError||role?.is_admin!==true)return send(403,{error:'仅开发者管理员可以查看 COS 容量'});

    // RLS remains enabled: we do not use a service-role key to bypass access.
    // Pagination bounded to avoid runaway Vercel invocations. Partial results
    // are labelled as such; no claim of safe deletion is ever made.
    const records=[];
    let referencesComplete=false;
    for(let page=0;page<60;page++){
      const {data,error}=await client.from('shiye_records')
        .select('store,record').order('user_id').order('store').order('id')
        .range(page*500,page*500+499);
      if(error)throw Error('读取云端引用索引失败：'+error.message);
      records.push(...data);
      if(data.length<500){referencesComplete=true;break;}
    }
    const references=collectCOSReferencePaths(records);
    const cos=new COS({SecretId:env.SHIYE_COS_SECRET_ID,SecretKey:env.SHIYE_COS_SECRET_KEY});
    const objects=[];
    let marker,inventoryComplete=false;
    for(let page=0;page<15;page++){
      const data=await cosList(cos,env,marker);
      const rows=data.Contents||[];
      objects.push(...rows);
      // Treat a missing or unknown pagination flag as incomplete, not as
      // evidence that the full private bucket has been enumerated.
      if(data.IsTruncated===undefined||data.IsTruncated===null)break;
      const truncated=String(data.IsTruncated).toLowerCase()==='true'||data.IsTruncated===1;
      if(!truncated){inventoryComplete=true;break;}
      const next=data.NextMarker||rows.at(-1)?.Key;
      if(!next||next===marker)break;
      marker=next;
    }
    const stats=summarizeCOSInventory(objects,{referencePaths:references,
      referencesComplete,inventoryComplete});
    return send(200,{...stats,scannedReferences:records.length});
  }catch(error){
    console.error('storage inventory unavailable',error?.name||'Error');
    return send(503,{error:'COS 容量统计暂不可用；未执行任何清理'});
  }
}

import COS from 'cos-nodejs-sdk-v5';
import {createClient} from '@supabase/supabase-js';

// Destructive, self-scoped and deliberately unavailable on the old main
// deployment. Production enablement requires a separate explicit release.
export const config={maxDuration:30};
const JSON_HEADERS={'Cache-Control':'private, no-store','Content-Type':'application/json'};
const fail=(res,status,error)=>res.status(status).json({error});
export default async function handler(req,res){
  for(const [k,v] of Object.entries(JSON_HEADERS))res.setHeader(k,v);
  if(req.method!=='POST')return fail(res,405,'只允许 POST');
  const env=process.env;
  if(env.VERCEL_GIT_COMMIT_REF!=='test'&&env.SHIYE_ACCOUNT_RESET_ENABLED!=='true')
    return fail(res,403,'当前部署未启用账号数据清理');
  const token=/^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(req.headers.authorization||'')?.[1];
  if(!token)return fail(res,401,'请先登录');
  if(!env.VITE_SHIYE_SUPABASE_URL||!env.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY)
    return fail(res,503,'云端身份配置缺失');
  if(!env.SHIYE_COS_SECRET_ID||!env.SHIYE_COS_SECRET_KEY||!env.SHIYE_COS_BUCKET||!env.SHIYE_COS_REGION)
    return fail(res,503,'COS 清理权限未配置；为避免只删索引，已拒绝清空');
  const cloud=createClient(env.VITE_SHIYE_SUPABASE_URL,env.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}
  });
  try{
    const {data:auth,error:authError}=await cloud.auth.getUser(token);
    if(authError||!auth.user||auth.user.is_anonymous)return fail(res,401,'登录已失效');
    const user=auth.user.id;
    const {data:account,error:accountError}=await cloud.from('shiye_accounts').select('user_id').eq('user_id',user).maybeSingle();
    if(accountError||!account)return fail(res,403,'当前账号无权清理资料');
    const mode=req.body?.mode;
    if(mode==='probe')return res.status(200).json({ready:true});
    if(mode!=='delete'||req.body?.confirm!=='RESET_MY_DATA')
      return fail(res,400,'必须再次确认彻底清除本人数据');
    const cos=new COS({SecretId:env.SHIYE_COS_SECRET_ID,SecretKey:env.SHIYE_COS_SECRET_KEY});
    const params={Bucket:env.SHIYE_COS_BUCKET,Region:env.SHIYE_COS_REGION};
    const prefix=user+'/';
    const page=await cos.getBucket({...params,Prefix:prefix,MaxKeys:80});
    const names=(page.Contents||[]).map(item=>item.Key);
    if(names.some(name=>typeof name!=='string'||!name.startsWith(prefix)))
      return fail(res,500,'COS 清理范围异常；未修改数据库');
    if(names.length){
      const removed=await cos.deleteMultipleObject({...params,Objects:names.map(Key=>({Key})),Quiet:false});
      if(removed.Error?.length)throw Error('COS 删除不完整，请重试');
      return res.status(200).json({more:true,cosDeleted:names.length});
    }
    // Supabase Storage objects must be deleted through Storage API, never
    // directly from storage.objects SQL (which leaves physical orphan files).
    const bucket=cloud.storage.from('shiye-private');
    async function firstFiles(folder,depth=0){
      if(depth>12)throw Error('私有目录嵌套过深，已停止');
      const {data,error}=await bucket.list(folder,{limit:100,offset:0});
      if(error)throw Error('Supabase 私有文件检查失败');
      const files=[];
      for(const item of data||[]){
        if(!item?.name||item.name.includes('/'))throw Error('私有文件名无效');
        const pathname=folder+'/'+item.name;
        if(item.id||item.metadata)files.push(pathname);
        else files.push(...await firstFiles(pathname,depth+1));
        if(files.length>=80)break;
      }
      return files.slice(0,80);
    }
    const storageFiles=await firstFiles(user);
    if(storageFiles.length){
      const {data,error}=await bucket.remove(storageFiles);
      if(error||!data)throw Error('Supabase 文件删除失败；云端记录未清空');
      return res.status(200).json({more:true,supabaseDeleted:storageFiles.length});
    }
    const {data:row,error:revisionError}=await cloud.from('shiye_revisions').select('revision').eq('user_id',user).single();
    if(revisionError)throw Error('无法读取数据版本；未清理云端记录');
    const revision=Number(row.revision);
    const operations=['assets','blobs','series','projects','meta','trash'].map(store=>({store,action:'clear'}));
    // A durable reset marker prevents an OLD local outbox from silently
    // replaying a deleted project after a different device comes back online.
    operations.push({store:'meta',action:'put',item:{
      id:'shiye-reset-barrier',revision:revision+1,updatedAt:new Date().toISOString()
    }});
    const {data:next,error:commitError}=await cloud.rpc('shiye_commit_v2',{
      operations,expected_revision:revision,operation_id:crypto.randomUUID()
    });
    if(commitError)throw Error('清空时账号版本已变化，未覆盖新数据；请再次执行');
    return res.status(200).json({reset:true,revision:next,more:false});
  }catch(error){
    console.warn('Self-service account reset failed:',error?.message);
    return fail(res,503,'彻底清理未完成：'+(error?.message||'服务暂不可用'));
  }
}

import COS from 'cos-nodejs-sdk-v5';
import {createClient} from '@supabase/supabase-js';

// A reset begins with a short account-scoped, atomic database transaction.
// Physical files are then removed in resumable bounded batches. Old devices
// observe the persistent reset marker before touching their IndexedDB outbox.
export const config={maxDuration:30};
const headers={'Cache-Control':'private, no-store','Content-Type':'application/json'};
const fail=(res,status,error)=>res.status(status).json({error});
const markerID='shiye-reset-barrier';
const validID=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export default async function handler(req,res){
 for(const [name,value] of Object.entries(headers))res.setHeader(name,value);
 if(req.method!=='POST')return fail(res,405,'只允许 POST');
 const env=process.env;
 if(env.VERCEL_GIT_COMMIT_REF!=='test'&&env.SHIYE_ACCOUNT_RESET_ENABLED!=='true')
   return fail(res,403,'当前部署未启用账号数据清理');
 const bearer=/^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(req.headers.authorization||'')?.[1];
 if(!bearer)return fail(res,401,'请先登录');
 const url=env.VITE_SHIYE_SUPABASE_URL,key=env.VITE_SHIYE_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return fail(res,503,'云端身份配置缺失');
 const cloud=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},
   global:{headers:{Authorization:'Bearer '+bearer}}});
 try{
   const {data:auth,error:authError}=await cloud.auth.getUser(bearer);
   if(authError||!auth.user||auth.user.is_anonymous)return fail(res,401,'登录已失效');
   const user=auth.user.id;
   const {data:account,error:accountError}=await cloud.from('shiye_accounts')
     .select('user_id').eq('user_id',user).maybeSingle();
   if(accountError||!account)return fail(res,403,'当前账号无权清理资料');
   const {data:stored,error:storedError}=await cloud.from('shiye_records').select('record')
     .eq('user_id',user).eq('store','meta').eq('id',markerID).maybeSingle();
   if(storedError)throw Error('无法读取账号重置标记；未执行清理');
   let marker=stored?.record??null;
   if(req.body?.mode==='probe')return res.status(200).json({
     ready:true,phase:marker?.phase||null,resetId:marker?.resetId||null
   });
   if(req.body?.confirm!=='RESET_MY_DATA'||!['start','delete'].includes(req.body?.mode))
     return fail(res,400,'必须确认彻底清除本人数据');
   const resetId=req.body?.resetId;
   if(!validID(resetId))return fail(res,400,'清空任务编号无效');
   if(!env.SHIYE_COS_SECRET_ID||!env.SHIYE_COS_SECRET_KEY||
     !env.SHIYE_COS_BUCKET||!env.SHIYE_COS_REGION)
     return fail(res,503,'COS 删除权限未配置；没有执行数据库清空');
   // Another device may have completed cleanup between two requests.
   // A retry for the same resetId is always idempotent.
   if(marker?.phase==='complete'&&marker.resetId===resetId)
     return res.status(200).json({reset:true,more:false,phase:'complete',resetId});
   if(req.body.mode==='start'){
     // A prior interrupted run must finish rather than being reset again.
     if(marker?.phase==='deleting')
       return res.status(200).json({more:true,phase:'deleting',resetId:marker.resetId,
         databaseCleared:true, resumed:true});
     if(marker?.phase==='complete'&&marker.resetId===resetId)
       return res.status(200).json({reset:true,more:false,phase:'complete',resetId});
     const {data:revisionRow,error:revisionError}=await cloud.from('shiye_revisions')
       .select('revision').eq('user_id',user).single();
     if(revisionError)throw Error('无法读取账号版本；没有执行清空');
     const revision=Number(revisionRow.revision);
     marker={id:markerID,resetId,revision:revision+1,phase:'deleting',
       updatedAt:new Date().toISOString()};
     const operations=['assets','blobs','series','projects','meta','trash']
       .map(store=>({store,action:'clear'}));
     operations.push({store:'meta',action:'put',item:marker});
     const {error}=await cloud.rpc('shiye_commit_v2',{
       operations,expected_revision:revision,operation_id:resetId
     });
     if(error)throw Error('账号在清理确认期间发生变化；请重新启动清空：'+error.message);
     return res.status(200).json({more:true,phase:'deleting',databaseCleared:true,
       resetId,revision:revision+1});
   }
   if(!marker||marker.resetId!==resetId||marker.phase!=='deleting')
     return fail(res,409,'清空任务已变化，请重新核对云端状态');
   const cos=new COS({SecretId:env.SHIYE_COS_SECRET_ID,
     SecretKey:env.SHIYE_COS_SECRET_KEY});
   const params={Bucket:env.SHIYE_COS_BUCKET,Region:env.SHIYE_COS_REGION},
     prefix=user+'/';
   // Tencent COS supports 1000 keys per multiple delete. Leave execution
   // headroom for Vercel and return after one bounded batch.
   const page=await cos.getBucket({...params,Prefix:prefix,MaxKeys:400});
   const names=(page.Contents||[]).map(object=>object.Key);
   if(names.some(name=>typeof name!=='string'||!name.startsWith(prefix)))
     throw Error('COS 删除范围校验失败');
   if(names.length){
     const removed=await cos.deleteMultipleObject({...params,
       Objects:names.map(Key=>({Key})),Quiet:false});
     if(removed.Error?.length)throw Error('COS 删除不完整，可安全继续清理');
     return res.status(200).json({more:true,phase:'cos',cosDeleted:names.length,resetId});
   }
   // Supabase Storage files must be deleted through its Storage API,
   // never by SQL; folders may be nested.
   const bucket=cloud.storage.from('shiye-private');
   async function firstFiles(folder,depth=0){
     if(depth>12)throw Error('私有文件目录嵌套过深，停止清理');
     const {data,error}=await bucket.list(folder,{limit:100,offset:0});
     if(error)throw Error('无法枚举 Supabase 私有文件：'+error.message);
     const files=[];
     for(const item of data||[]){
       if(!item?.name||item.name.includes('/'))throw Error('云端文件名称异常');
       const pathname=folder+'/'+item.name;
       if(item.id||item.metadata)files.push(pathname);
       else files.push(...await firstFiles(pathname,depth+1));
       if(files.length>=100)break;
     }
     return files.slice(0,100);
   }
   const files=await firstFiles(user);
   if(files.length){
     const {error}=await bucket.remove(files);
     if(error)throw Error('Supabase 私有文件删除失败：'+error.message);
     return res.status(200).json({more:true,phase:'supabase',supabaseDeleted:files.length,resetId});
   }
   // Persist "complete" under the same reset ID; keep marker indefinitely
   // so offline phones/laptops can invalidate pre-reset IndexedDB on login.
   const {data:revisionRow,error:revisionError}=await cloud.from('shiye_revisions')
     .select('revision').eq('user_id',user).single();
   if(revisionError)throw Error('无法完成清理标记');
   const final={...marker,phase:'complete',completedAt:new Date().toISOString()};
   const {error}=await cloud.rpc('shiye_commit_v2',{
     operations:[{store:'meta',action:'put',item:final}],
     expected_revision:Number(revisionRow.revision),operation_id:crypto.randomUUID()
   });
   if(error)throw Error('清理文件已完成，但账号确认尚未完成，可重试');
   return res.status(200).json({reset:true,more:false,phase:'complete',resetId});
 }catch(error){
   console.warn('Account reset operation failed:',error?.message);
   return fail(res,503,'账号清空暂未完成：'+(error?.message||'服务暂不可用'));
 }
}

import COS from 'cos-nodejs-sdk-v5';

export const RESET_MARKER_ID='shiye-reset-barrier';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validResetId=id=>typeof id==='string'&&UUID.test(id);

export function assertGcScope(user,record){
 if(!validResetId(user)||!validResetId(record?.resetId)||
   record?.id!==RESET_MARKER_ID||!['deleting','complete'].includes(record.phase))
   throw Error('拒绝处理无效的账号清理范围');
 return {root:user+'/',keep:user+'/reset-'+record.resetId+'/'};
}

export async function readGcMarker(client,user){
 const {data,error}=await client.from('shiye_records').select('record')
   .eq('user_id',user).eq('store','meta').eq('id',RESET_MARKER_ID).maybeSingle();
 if(error)throw Error('读取服务端账号清理状态失败：'+error.message);
 return data?.record||null;
}
export async function writeGcMarker(client,user,before,after){
 if(before.resetId!==after.resetId)throw Error('不得更改进行中的清空任务');
 const {data,error}=await client.from('shiye_records').update({record:after})
   .eq('user_id',user).eq('store','meta').eq('id',RESET_MARKER_ID)
   .eq('record->>resetId',before.resetId)
   .eq('record->>phase','deleting').select('id');
 if(error||data?.length!==1)throw Error('更新清空任务进度失败；下次可重试');
}
// A unit of work is bounded so an interrupted function can always resume.
// The server owns both the work selection and the COS credentials; clients
// never supply a COS prefix, bucket, key, or path.
export async function gcOneBatch({client,user,record,env=process.env,
  cosFactory=config=>new COS(config),maxCos=400,maxFiles=100}){
 const {root,keep}=assertGcScope(user,record);
 if(record.phase==='complete')return {complete:true,phase:'complete'};
 if(!env.SHIYE_COS_SECRET_ID||!env.SHIYE_COS_SECRET_KEY||
    !env.SHIYE_COS_BUCKET||!env.SHIYE_COS_REGION)
   throw Error('服务器 COS 清理凭证未配置');
 const cos=cosFactory({SecretId:env.SHIYE_COS_SECRET_ID,SecretKey:env.SHIYE_COS_SECRET_KEY});
 const params={Bucket:env.SHIYE_COS_BUCKET,Region:env.SHIYE_COS_REGION};
 if(!record.gcCosDone){
   const cursor=record.gcCursor||undefined;
   const page=await cos.getBucket({...params,Prefix:root,MaxKeys:maxCos,...(cursor?{Marker:cursor}:{})});
   const list=page.Contents||[];
   const keys=list.map(item=>item.Key);
   if(keys.some(key=>typeof key!=='string'||!key.startsWith(root)))
     throw Error('COS 返回了不属于当前账号的文件；已中止');
   const oldKeys=keys.filter(key=>!key.startsWith(keep));
   if(oldKeys.length){
     const result=await cos.deleteMultipleObject({
       ...params,Objects:oldKeys.map(Key=>({Key})),Quiet:false
     });
     if(result?.Error?.length)throw Error('COS 批量删除返回部分失败');
   }
   const truncated=['true','1'].includes(String(page.IsTruncated).toLowerCase());
   const nextCursor=truncated?(page.NextMarker||keys.at(-1)):null;
   if(truncated&&(!nextCursor||nextCursor===cursor))throw Error('COS 分页游标未前进；未完成清理');
   const update={...record,gcCosDone:!truncated,gcCursor:nextCursor,
      gcCosDeleted:(Number(record.gcCosDeleted)||0)+oldKeys.length,
      gcUpdatedAt:new Date().toISOString()};
   await writeGcMarker(client,user,record,update);
   return {complete:false,phase:'cos',deleted:oldKeys.length,cursor:nextCursor};
 }
 // Objects in Supabase Storage MUST be deleted through Storage API, not SQL.
 const bucket=client.storage.from('shiye-private');
 async function findFiles(folder,depth=0){
   if(depth>12)throw Error('Supabase 旧文件目录嵌套过深');
   const {data,error}=await bucket.list(folder,{limit:100,offset:0});
   if(error)throw Error('Supabase Storage 列举失败：'+error.message);
   const result=[];
   for(const entry of data||[]){
     if(!entry?.name||entry.name.includes('/'))throw Error('Supabase Storage 返回了非法文件名');
     const path=folder+'/'+entry.name;
     if(path===keep.slice(0,-1))continue;
     if(entry.id||entry.metadata)result.push(path);
     else result.push(...await findFiles(path,depth+1));
     if(result.length>=maxFiles)break;
   }
   return result.slice(0,maxFiles);
 }
 const files=await findFiles(user);
 if(files.length){
   if(files.some(file=>!file.startsWith(root)||file.startsWith(keep)))
      throw Error('Supabase 删除范围异常');
   const {error}=await bucket.remove(files);
   if(error)throw Error('Supabase 文件删除失败：'+error.message);
   const update={...record,gcStorageDeleted:(Number(record.gcStorageDeleted)||0)+files.length,
      gcUpdatedAt:new Date().toISOString()};
   await writeGcMarker(client,user,record,update);
   return {complete:false,phase:'supabase',deleted:files.length};
 }
 const update={...record,phase:'complete',completedAt:new Date().toISOString(),
   gcCursor:null,gcCosDone:true,gcUpdatedAt:new Date().toISOString()};
 await writeGcMarker(client,user,record,update);
 return {complete:true,phase:'complete',cosDeleted:update.gcCosDeleted||0,
    storageDeleted:update.gcStorageDeleted||0};
}

export async function processGc({client,user,env=process.env,oneBatch=gcOneBatch,
 maxBatches=4,deadlineMs=24000}){
 const deadline=Date.now()+deadlineMs;
 let result={complete:false,phase:'deleting',processed:0};
 for(let i=0;i<maxBatches&&Date.now()<deadline;i++){
   const record=await readGcMarker(client,user);
   if(!record||record.phase==='complete')return {...result,complete:!record?false:true,phase:record?.phase||'missing'};
   result=await oneBatch({client,user,record,env});
   result.processed=i+1;
   if(result.complete)return result;
 }
 return result;
}

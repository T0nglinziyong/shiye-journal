// Run from an independently secured machine; never in browser or CI artifacts.
// Read-only cloud API access. Credentials from runtime environment ONLY.
import {createClient} from '@supabase/supabase-js';
import COS from 'cos-nodejs-sdk-v5';
import {resolve} from 'node:path';
import {createCloudSnapshot,verifyCloudSnapshot} from './cloud-backup-core.mjs';

const vars=['SHIYE_BACKUP_ROOT','SHIYE_SUPABASE_URL','SHIYE_SUPABASE_SERVICE_ROLE_KEY'];
if(process.argv[2]!=='verify'&&vars.some(k=>!process.env[k]))throw Error('缺少备份配置：'+vars.filter(k=>!process.env[k]).join(', '));
if(process.argv[2]==='verify'){
  if(!process.argv[3])throw Error('用法：node scripts/cloud-backup-cli.mjs verify /secure/snapshot-dir');
  console.log(JSON.stringify(await verifyCloudSnapshot(resolve(process.argv[3]))));
}else{
 const supabase=createClient(process.env.SHIYE_SUPABASE_URL,process.env.SHIYE_SUPABASE_SERVICE_ROLE_KEY,
   {auth:{persistSession:false,autoRefreshToken:false}});
 const sorts={shiye_accounts:['user_id'],shiye_revisions:['user_id'],
   shiye_records:['user_id','store','id'],shiye_changes:['user_id','revision'],
   shiye_commits:['user_id','operation_id']};
 async function* readTable(table){
   if(!sorts[table])throw Error('未授权读取的数据表');
   let offset=0;
   for(;;){
     let q=supabase.from(table).select('*');
     for(const key of sorts[table])q=q.order(key,{ascending:true});
     const {data,error}=await q.range(offset,offset+499);
     if(error)throw Error('云端备份读取 '+table+' 失败：'+error.message);
     for(const row of data)yield row;
     if(data.length<500)break;
     offset+=data.length;
   }
 }
 const cosReady=['SHIYE_COS_SECRET_ID','SHIYE_COS_SECRET_KEY','SHIYE_COS_BUCKET','SHIYE_COS_REGION'].every(k=>!!process.env[k]);
 const cos=cosReady?new COS({SecretId:process.env.SHIYE_COS_SECRET_ID,SecretKey:process.env.SHIYE_COS_SECRET_KEY}):null;
 async function readObject({provider,path}){
   let url;
   if(provider==='cos'){
     if(!cos)throw Error('缺少 COS 只读凭据，停止备份；不跳过私人图片');
     url=await new Promise((ok,fail)=>cos.getObjectUrl({
       Bucket:process.env.SHIYE_COS_BUCKET,Region:process.env.SHIYE_COS_REGION,
       Key:path,Method:'GET',Protocol:'https:',Sign:true,Expires:120
     },(error,data)=>error?fail(error):ok(data.Url)));
   }else if(provider==='supabase'){
     const {data,error}=await supabase.storage.from('shiye-private').createSignedUrl(path,120);
     if(error)throw error;url=data.signedUrl;
   }else throw Error('未知存储服务');
   const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
   if(!response.ok)throw Error('无法读取私人对象：HTTP '+response.status);
   return response;
 }
 const result=await createCloudSnapshot({
   root:process.env.SHIYE_BACKUP_ROOT,readTable,readObject,
   onProgress:event=>console.log('[snapshot]',event.stage,event.table||'',event.count||0)
 });
 const check=await verifyCloudSnapshot(result.directory);
 console.log(JSON.stringify({directory:result.directory,verified:check.verified,tableCounts:check.tables,objects:check.objects}));
}

// Developer-only storage observability. It is not a user-facing settings
// screen. RPC and COS endpoint each independently verify admin credentials.
const bytes=value=>{
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)return '未知';
  if(n<1024)return n+' B';
  const units=['KB','MB','GB','TB'],power=Math.min(4,Math.floor(Math.log(n)/Math.log(1024))),factor=1024**power;
  return (n/factor).toFixed(power>=3?2:1)+' '+units[power-1];
};
export {bytes as formatStorageBytes};

export function createStorageUsageController({client,fetcher=fetch,confirmAction=confirm}){
  const getDB=async()=>{
    const {data,error}=await client.rpc('shiye_storage_admin_stats');
    if(error)throw Error(error.message||'数据库容量统计不可用');
    if(!data||typeof data!=='object')throw Error('数据库没有返回有效统计结果');
    return data;
  };
  const getCOS=async()=>{
    const {data,error}=await client.auth.getSession();
    if(error||!data.session?.access_token)throw Error('请先登录');
    const response=await fetcher('/api/storage-usage',{method:'GET',
      headers:{Authorization:'Bearer '+data.session.access_token},
      cache:'no-store',signal:AbortSignal.timeout(60000)});
    let result;try{result=await response.json();}catch{throw Error('COS 未返回有效统计');}
    if(!response.ok)throw Error(result?.error||'COS 容量统计失败');
    return result;
  };
  const prune=async({eligible=0}={})=>{
    if(!(Number(eligible)>0))return 0;
    if(!confirmAction('将最多 5,000 条超过 90 天的已确认同步提交收据从 Supabase 中清理？不会删除素材、作品、Tombstone、同步水位线或 COS 图片。'))return null;
    const {data,error}=await client.rpc('shiye_storage_prune_commits',
      {retention_days:90,batch_limit:5000});
    if(error)throw Error(error.message||'清理提交收据失败');
    return Number(data)||0;
  };
  return {getDB,getCOS,prune};
}

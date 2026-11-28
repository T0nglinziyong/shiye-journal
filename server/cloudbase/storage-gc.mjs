import {ServiceError} from './errors.mjs';
import {cloudBaseGateway} from './postgres.mjs';

// The database supplies candidates and the Storage RLS policy rechecks each
// one at DELETE time. This function never accepts a bucket or path from the
// browser, and never uses a service-role key.
export function createStorageGarbageCollector({envId,rpc,fetcher=fetch}={}){
  const gateway=cloudBaseGateway(envId);
  if(typeof rpc!=='function')throw TypeError('GC 数据库核查器未配置');
  return async(token,owner)=>{
    const plan=await rpc('shiye_gc_plan_v1',token,{max_items:20});
    if(!Array.isArray(plan?.names)||plan.names.length>20)
      throw new ServiceError(502,'GC_PLAN_INVALID','文件回收计划无效');
    const names=plan.names;
    if(names.some(name=>typeof name!=='string'||name.length>500||
      !name.startsWith(owner+'/')||name.includes('..')||name.includes('?')||name.includes('#')))
      throw new ServiceError(502,'GC_SCOPE_INVALID','文件回收范围核查失败');
    let deleted=0;
    for(let offset=0;offset<names.length;offset+=4){
      const results=await Promise.allSettled(names.slice(offset,offset+4).map(async name=>{
        const objectName=name.split('/').map(encodeURIComponent).join('/');
        const response=await fetcher(gateway+'/v1/storages/object/shiye-private/'+objectName,{
          method:'DELETE',headers:{Authorization:'Bearer '+token},
          signal:AbortSignal.timeout(12000),cache:'no-store',redirect:'error'});
        if(response.status===404)return false;
        if(!response.ok)throw new ServiceError(503,'GC_DELETE_FAILED','云存储文件回收暂未完成');
        await response.body?.cancel().catch(()=>{});
        return true;
      }));
      for(const result of results){
        if(result.status==='rejected')throw result.reason;
        if(result.value)deleted++;
      }
    }
    const status=await rpc('shiye_gc_finish_v1',token,{});
    if(typeof status?.complete!=='boolean')
      throw new ServiceError(502,'GC_STATUS_INVALID','文件回收状态无效');
    return {deleted,resetComplete:status.complete,remaining:status.remaining??0,
      more:names.length===20,scanned:plan.scanned??0};
  };
}

import {ServiceError} from './errors.mjs';
const functions=new Set(['shiye_platform_capabilities_v1','shiye_search_assets_v1',
  'shiye_search_candidates_v1','shiye_search_index_put_v1','shiye_search_vectors_v1',
  'shiye_account_storage_v1','shiye_search_budget_v1']);
const tokenPattern=/^[A-Za-z0-9._~-]{20,8192}$/;
export function cloudBaseGateway(envId){
  if(typeof envId!=='string'||!/^[-a-z0-9]{1,128}$/.test(envId))
    throw new ServiceError(503,'ENV_NOT_CONFIGURED','CloudBase 环境尚未配置');
  return `https://${envId}.api.tcloudbasegateway.com`;
}
export function createPostgresRPC({envId,fetcher=fetch,timeoutMs=15000}={}){
  const gateway=cloudBaseGateway(envId);
  return async(name,token,args={})=>{
    if(!functions.has(name))throw new ServiceError(404,'RPC_NOT_ALLOWED','数据库函数未登记');
    if(!tokenPattern.test(token||''))throw new ServiceError(401,'AUTH_REQUIRED','请先登录');
    const response=await fetcher(gateway+'/v1/rdb/rest/rpc/'+name,{method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(args),signal:AbortSignal.timeout(timeoutMs),cache:'no-store',redirect:'error'});
    let data;try{data=await response.json();}catch{throw new ServiceError(502,'DATABASE_RESPONSE','数据库返回格式无效');}
    if(!response.ok){
      if(response.status===401||response.status===403)throw new ServiceError(response.status,'DATABASE_AUTH','数据库访问未获授权');
      if(response.status===404||data?.code==='PGRST202'||data?.code==='42883')
        throw new ServiceError(503,'MIGRATION_REQUIRED','此能力的 CloudBase 数据库迁移尚未应用');
      if(response.status===429)throw new ServiceError(429,'RATE_LIMITED','请求过于频繁，请稍后重试');
      if(response.status===409||data?.code==='PT409')throw new ServiceError(409,'STALE_INPUT','资料已变化，请刷新后重试');
      if(response.status===400||data?.code==='22023')throw new ServiceError(400,'INVALID_QUERY','查询参数不符合当前数据库协议');
      throw new ServiceError(503,'DATABASE_UNAVAILABLE','CloudBase 数据库暂时不可用');
    }
    return data;
  };
}

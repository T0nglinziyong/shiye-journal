// CloudBase-only, read-only account storage inventory. The browser never
// enumerates another account or receives COS deletion privileges.
import {cloudApiRequest} from './cloud-api-origin.js';
export const formatStorageBytes=value=>{
  if(value==null||!Number.isFinite(Number(value))||Number(value)<0)return '未知';
  const n=Number(value);if(n<1024)return n+' B';
  const power=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));
  return (n/1024**power).toFixed(power>=3?2:1)+' '+['KB','MB','GB','TB'][power-1];
};
export function createStorageUsageController({fetcher=cloudApiRequest}={}){
  const getUsage=async()=>{
    const response=await fetcher('/api/storage-usage',{method:'GET',cache:'no-store',
      signal:AbortSignal.timeout(60000)});
    let result;try{result=await response.json();}catch{throw Error('CloudBase 未返回有效的容量统计');}
    if(!response.ok)throw Object.assign(Error(result?.error||'CloudBase 存储统计失败'),{
      status:response.status,code:result?.code});
    if(result?.scope!=='current-account'||!result.database||typeof result.database!=='object')
      throw Error('CloudBase 统计协议不匹配，未查询其他账号');
    return result;
  };
  return {getUsage};
}

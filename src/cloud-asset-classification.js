import {cloudApiRequest} from './cloud-api-origin.js';

export async function classifyCloudAsset(id,{db,signal,reclassify=false,skipFlush=false,
  skipRefresh=false,request=cloudApiRequest}={}){
  if(typeof id!=='string'||!id)throw Error('素材编号无效');
  if(!skipFlush)await db.flushProjects();
  signal?.throwIfAborted?.();
  const response=await request('/api/classify-asset',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({assetId:id,reclassify}),signal});
  const body=await response.json();
  if(!response.ok)throw Object.assign(Error(body.error||'云端素材分类失败'),{status:response.status,code:body.code});
  if(!body.asset||body.asset.id!==id)throw Error('云端素材分类结果与请求不一致');
  if(!skipRefresh)await db.refreshCloud();
  return body.asset;
}
export async function classifyCloudProject(id,{db,signal,skipFlush=false}={}){
  if(typeof id!=='string'||!id)throw Error('作品编号无效');
  if(!skipFlush)await db.flushProjects();
  signal?.throwIfAborted?.();
  const response=await cloudApiRequest('/api/classify-project',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:id}),signal});
  const body=await response.json();
  if(!response.ok)throw Object.assign(Error(body.error||'云端作品整理失败'),{status:response.status,code:body.code});
  if(typeof body.title!=='string'||!Array.isArray(body.tags))throw Error('云端作品整理结果不完整');
  return body;
}

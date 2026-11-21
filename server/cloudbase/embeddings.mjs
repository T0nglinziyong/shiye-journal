import {createHash} from 'node:crypto';
import {ServiceError} from './errors.mjs';

export const EMBEDDING_DIMENSIONS=1024;
export function embeddingConfiguration(env={}){
  if(env.SHIYE_VECTOR_SEARCH_ENABLED!=='true')return null;
  const endpoint=env.SHIYE_EMBEDDING_ENDPOINT,model=env.SHIYE_EMBEDDING_MODEL,key=env.SHIYE_EMBEDDING_API_KEY;
  if(!endpoint||!model||!key)return null;
  let url;try{url=new URL(endpoint);}catch{throw new ServiceError(503,'EMBEDDING_CONFIG','向量模型地址无效');}
  const hosts=String(env.SHIYE_EMBEDDING_ALLOWED_HOSTS||'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
    !hosts.includes(url.hostname.toLowerCase())||url.port&&url.port!=='443'||
    /^(localhost|127\.|0\.|169\.254\.|10\.|192\.168\.|\[)/i.test(url.hostname))
    throw new ServiceError(503,'EMBEDDING_CONFIG','向量模型必须使用服务端明确允许的 HTTPS 地址');
  if(!/^[A-Za-z0-9._:/@-]{1,160}$/.test(model)||Number(env.SHIYE_EMBEDDING_DIMENSIONS||1024)!==1024)
    throw new ServiceError(503,'EMBEDDING_CONFIG','当前向量索引要求已登记的 1024 维模型');
  // Explicit version tags prevent a provider/model upgrade from silently mixing
  // incompatible vectors in the same index, even if their dimensions match.
  const version=String(env.SHIYE_EMBEDDING_VERSION||'');
  if(!/^[A-Za-z0-9._-]{1,80}$/.test(version))throw new ServiceError(503,'EMBEDDING_CONFIG','请配置向量模型版本标识');
  return {endpoint:url.href,model,key,dimensions:1024,version,
    modelKey:createHash('sha256').update(JSON.stringify([url.href,model,version,1024])).digest('hex')};
}
export function validateEmbedding(vector){
  if(!Array.isArray(vector)||vector.length!==1024||vector.some(value=>
    typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e6)||
    !vector.some(value=>value!==0))
    throw new ServiceError(502,'EMBEDDING_RESPONSE','模型返回的向量维度或数值无效');
  return vector;
}
export function createEmbeddingClient(config,{fetcher=fetch,timeoutMs=18000}={}){
  return async inputs=>{
    if(!config)throw new ServiceError(503,'VECTOR_NOT_CONFIGURED','尚未配置向量模型；关键词检索仍可使用');
    if(!Array.isArray(inputs)||inputs.length<1||inputs.length>4||inputs.some(value=>
      typeof value!=='string'||!value.trim()||[...value].length>2048))
      throw new ServiceError(400,'EMBEDDING_INPUT','每批最多向量化四段素材名称与标签');
    const response=await fetcher(config.endpoint,{method:'POST',redirect:'error',
      headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json'},
      body:JSON.stringify({model:config.model,input:inputs,encoding_format:'float'}),
      signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok)throw new ServiceError(response.status===429?429:503,
      'EMBEDDING_UNAVAILABLE','向量模型暂时不可用；未写入不完整索引');
    const reader=response.body?.getReader();let bytes=0,chunks=[];
    if(!reader)throw new ServiceError(502,'EMBEDDING_RESPONSE','向量模型没有返回数据');
    try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;
      if(bytes>1000000){await reader.cancel();throw new ServiceError(502,'EMBEDDING_RESPONSE','向量模型返回过大');}
      chunks.push(Buffer.from(value));
    }}finally{reader.releaseLock();}
    let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch{throw new ServiceError(502,'EMBEDDING_RESPONSE','向量模型未返回有效 JSON');}
    if(data.model!=null&&data.model!==config.model)
      throw new ServiceError(502,'EMBEDDING_RESPONSE','模型版本与配置不一致；未写入索引');
    if(!Array.isArray(data.data)||data.data.length!==inputs.length)
      throw new ServiceError(502,'EMBEDDING_RESPONSE','向量模型返回数量不匹配');
    const vectors=new Array(inputs.length);
    for(const item of data.data){
      if(!Number.isInteger(item.index)||item.index<0||item.index>=inputs.length||vectors[item.index])
        throw new ServiceError(502,'EMBEDDING_RESPONSE','向量模型返回序号无效');
      vectors[item.index]=validateEmbedding(item.embedding);
    }
    return vectors;
  };
}

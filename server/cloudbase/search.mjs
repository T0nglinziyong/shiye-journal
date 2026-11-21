import {ServiceError,requireObject,boundedInteger} from './errors.mjs';
import {validateEmbedding} from './embeddings.mjs';

const text=value=>typeof value==='string'?value.normalize('NFKC').trim():'';
export function createSearchService({rpc,embed,modelKey=null}={}){
  async function requireVectorModel(token){
    if(!modelKey)throw new ServiceError(503,'VECTOR_NOT_CONFIGURED','尚未配置向量模型；没有向外发送素材内容');
    const capabilities=await rpc('shiye_platform_capabilities_v1',token,{});
    if(capabilities?.vector!==true||!Array.isArray(capabilities.vectorModels)||
       !capabilities.vectorModels.includes(modelKey))
      throw new ServiceError(503,'VECTOR_NOT_READY','向量数据库迁移或模型登记尚未完成；未调用付费模型');
  }
  async function search(token,input){
    requireObject(input);
    const query=text(input.query),mode=input.mode||'keyword';
    if(!query||[...query].length>256||!['keyword','semantic','hybrid'].includes(mode))
      throw new ServiceError(400,'INVALID_QUERY','请输入 1–256 字的检索内容并选择有效模式');
    const limit=boundedInteger(input.limit,30,1,50);
    const kind=text(input.kind)||'all',status=text(input.status)||'all',seriesID=text(input.seriesID)||'all';
    if(kind.length>30||status.length>30||seriesID.length>200)throw new ServiceError(400,'INVALID_FILTER','检索条件过长');
    const filters={p_query:query,p_kind:kind,p_status:status,p_series:seriesID,p_limit:limit};
    if(mode==='keyword')return rpc('shiye_search_assets_v1',token,filters);
    if(!modelKey)throw new ServiceError(503,'VECTOR_NOT_CONFIGURED','尚未配置向量检索；请选择关键词检索');
    await requireVectorModel(token);
    // Persistent per-account quota is checked before every paid model call,
    // including search requests. A cold function instance cannot reset it.
    const budget=await rpc('shiye_search_budget_v1',token,{p_units:1});
    if(!budget?.allowed)throw new ServiceError(429,'VECTOR_BUDGET','本分钟的向量请求已达上限，请稍后重试');
    const [vector]=await embed([query]);validateEmbedding(vector);
    return rpc('shiye_search_vectors_v1',token,{...filters,p_model_key:modelKey,
      p_embedding:JSON.stringify(vector),p_hybrid:mode==='hybrid'});
  }
  async function index(token,input={}){
    requireObject(input);
    if(!modelKey)throw new ServiceError(503,'VECTOR_NOT_CONFIGURED','尚未配置向量模型；没有向外发送素材内容');
    await requireVectorModel(token);
    const limit=boundedInteger(input.limit,4,1,4);
    const budget=await rpc('shiye_search_budget_v1',token,{p_units:limit});
    if(!budget?.allowed)throw new ServiceError(429,'VECTOR_BUDGET','本分钟的向量请求已达上限，请稍后重试');
    // The database claims current *owned* documents. The browser cannot submit
    // another account, arbitrary text, model name, hash or ready-made vectors.
    const candidates=await rpc('shiye_search_candidates_v1',token,{p_model_key:modelKey,p_limit:limit});
    if(!Array.isArray(candidates)||candidates.length>limit)
      throw new ServiceError(502,'INDEX_RESPONSE','索引候选返回无效');
    if(!candidates.length)return {indexed:0,stale:0,claimed:0,modelKey};
    const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if(new Set(candidates.map(row=>row?.id)).size!==candidates.length)
      throw new ServiceError(502,'INDEX_RESPONSE','索引候选包含重复 ID');
    for(const row of candidates)if(!row||typeof row.id!=='string'||!row.id||row.id.length>500||
      typeof row.content!=='string'||[...row.content].length>2048||
      !/^[a-f0-9]{32}$/.test(row.contentHash||'')||!uuid.test(row.lease||'')||!uuid.test(row.epoch||''))
      throw new ServiceError(502,'INDEX_RESPONSE','索引候选缺少版本标识');
    const vectors=await embed(candidates.map(row=>[...row.content].slice(0,2048).join('')));
    const items=candidates.map((row,index)=>({id:row.id,content_hash:row.contentHash,
      lease:row.lease,epoch:row.epoch,embedding:JSON.stringify(validateEmbedding(vectors[index]))}));
    // One atomic result commit compares hash + lease + account epoch. A title
    // edit, deletion, reset or newer worker cannot be overwritten by a late AI response.
    const result=await rpc('shiye_search_index_put_v1',token,{p_model_key:modelKey,p_items:items});
    if(!Number.isInteger(result?.indexed)||!Number.isInteger(result?.stale)||
      result.indexed<0||result.stale<0||result.indexed+result.stale!==candidates.length)
      throw new ServiceError(502,'INDEX_RESPONSE','向量索引回执不完整；不能将该批标记为完成');
    return {indexed:result.indexed,stale:result.stale,claimed:candidates.length,modelKey};
  }
  return {search,index};
}

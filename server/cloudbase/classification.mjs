import {randomUUID} from 'node:crypto';
import {ServiceError} from './errors.mjs';
import {cloudBaseGateway} from './postgres.mjs';
import {materialKinds,materialKindDetails,materialRoles,contentCategories,layoutFits,tagGroups} from '../../src/material-taxonomy.js';
import {applyAIClassification} from '../../src/material-classification.js';

const idPattern=/^[A-Za-z0-9_-]{1,100}$/;
const parse=async response=>{
  if(!response.ok)throw new ServiceError(response.status===404?409:503,'CLASSIFICATION_SOURCE_UNAVAILABLE','素材尚未同步到云端，请稍后重试');
  const text=await response.text();
  if(text.length>350000)throw new ServiceError(502,'CLASSIFICATION_SOURCE_INVALID','素材元数据过大');
  try{return JSON.parse(text);}catch{throw new ServiceError(502,'CLASSIFICATION_SOURCE_INVALID','素材元数据无效');}
};
const choices=rows=>rows.map(([id,label])=>`${id}=${label}`).join('、');
const dataURL=(bytes,type)=>`data:${type};base64,${bytes.toString('base64')}`;
export function createCloudMaterialClassifier({envId,env=process.env,fetcher=fetch,commit}={}){
  const gateway=cloudBaseGateway(envId);
  const modelKey=env.SHIYE_CLASSIFICATION_API_KEY;
  const model=env.SHIYE_CLASSIFICATION_MODEL||'deepseek-flash';
  const version=env.SHIYE_CLASSIFICATION_MODEL_VERSION||model;
  const ready=()=>!!modelKey&&/^[-A-Za-z0-9_.]{1,120}$/.test(model)&&
    /^[-A-Za-z0-9_.]{1,120}$/.test(version);
  const record=async(token,userID,store,id)=>{
    const url=new URL(gateway+'/v1/rdb/rest/shiye_records');
    url.searchParams.set('select','record');url.searchParams.set('user_id','eq.'+userID);
    url.searchParams.set('store','eq.'+store);url.searchParams.set('id','eq.'+id);
    const rows=await parse(await fetcher(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      signal:AbortSignal.timeout(12000),cache:'no-store',redirect:'error'}));
    return Array.isArray(rows)?rows[0]?.record:null;
  };
  const revision=async(token,userID)=>{
    const url=new URL(gateway+'/v1/rdb/rest/shiye_revisions');
    url.searchParams.set('select','revision,account_epoch');url.searchParams.set('user_id','eq.'+userID);
    const rows=await parse(await fetcher(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      signal:AbortSignal.timeout(12000),cache:'no-store',redirect:'error'}));
    return Array.isArray(rows)?rows[0]:null;
  };
  const image=async(token,userID,blobID,{preview=false}={})=>{
    if(!idPattern.test(blobID||''))return null;
    const meta=await record(token,userID,'blobs',blobID);
    const path=meta?.storagePath;
    if(meta?.storageProvider!=='cloudbase'||typeof path!=='string'||!path.startsWith(userID+'/')||
      path.includes('..')||path.includes('?')||path.includes('#'))return null;
    const request=async key=>fetcher(gateway+'/v1/storages/object/shiye-private/'+
      key.split('/').map(encodeURIComponent).join('/'),{headers:{Authorization:'Bearer '+token},
      signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'});
    let response=await request(preview?path+'-preview480.webp':path);
    if(preview&&response.status===404)response=await request(path);
    if(!response.ok)throw new ServiceError(409,'CLASSIFICATION_IMAGE_PENDING','素材图片尚未同步，请稍后重试');
    const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
    if(!['image/jpeg','image/png','image/webp'].includes(type))throw new ServiceError(400,'CLASSIFICATION_IMAGE_TYPE','素材图片格式不支持分析');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(!bytes.length||bytes.length>7_000_000)throw new ServiceError(413,'CLASSIFICATION_IMAGE_SIZE','素材图片过大，暂不能云端分析');
    return dataURL(bytes,type);
  };
  const classify=async(token,userID,assetID,{reclassify=false}={})=>{
    if(!ready())throw new ServiceError(503,'CLASSIFICATION_NOT_CONFIGURED','云端素材分类模型尚未配置');
    if(!idPattern.test(assetID||''))throw new ServiceError(400,'INVALID_ASSET_ID','素材编号无效');
    const original=await record(token,userID,'assets',assetID);
    if(!original||original.id!==assetID||original.isProjectInternal)
      throw new ServiceError(404,'ASSET_NOT_FOUND','素材不存在或尚未同步');
    const [cutout,context]=await Promise.all([
      image(token,userID,original.blobId,{preview:true}),
      image(token,userID,original.candidateFrameBlobId,{preview:true})]);
    if(!cutout)throw new ServiceError(409,'CLASSIFICATION_IMAGE_PENDING','素材图片尚未同步，请稍后重试');
    const prompt=`分析手帐素材。第一张是透明抠图，第二张是导入时的候选原图（若有）。物件类型按实际使用形态判定，画面中的布纹不等于布片；看不出背胶或基材时降低置信度。不要把原始来源、透明度或尺寸当标签。只返回 JSON。\n`+
      `类型：${choices(materialKinds)}。具体类型：${choices(materialKindDetails)}。主要和次要作用：${choices(materialRoles)}。`+
      `内容类别：${choices(contentCategories)}。版面适配：${choices(layoutFits)}。`+
      `开放标签分组：${choices(tagGroups)}。每个类别输出 {"id":"字典ID","confidence":0到1}；多选类别输出数组。`+
      `标签各组输出 [{"value":"确实可见的标签","confidence":0到1}]。`+
      `完整 JSON 结构示例：{"title":"花朵贴纸","titleConfidence":0.9,"kind":{"id":"sticker","confidence":0.8},`+
      `"kindDetail":null,"role":{"id":"accent","confidence":0.8},"secondaryRoles":[],`+
      `"contentCategories":[],"layoutFits":[],"contentTags":[],"themeTags":[],"styleTags":[],`+
      `"colorTags":[],"materialTags":[],"moodTags":[],"tags":[]}。`+
      `还需 title 和 titleConfidence。任何信息无法判断时用空数组或低置信度。`+
      `已知元数据：${JSON.stringify({widthMM:original.physicalWidthMM,heightMM:original.physicalHeightMM,
        source:original.sourceIdentifier,cutout:!!original.finalMaskBlobId,
        userConfirmedType:original.categoryEvidence?.kind?.source==='user'?original.kind:null})}`;
    const contents=[{type:'text',text:prompt},{type:'image_url',image_url:{url:cutout,detail:'high'}}];
    if(context)contents.push({type:'image_url',image_url:{url:context,detail:'low'}});
    const response=await fetcher('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',
      headers:{Authorization:'Bearer '+modelKey,'Content-Type':'application/json'},
      body:JSON.stringify({model,temperature:0,max_tokens:1700,response_format:{type:'json_object'},
        messages:[{role:'user',content:contents}]}),signal:AbortSignal.timeout(35000)});
    if(!response.ok)throw new ServiceError(503,'CLASSIFICATION_MODEL_UNAVAILABLE','云端素材分析暂不可用');
    const answer=await parse(response);
    let result;
    try{result=JSON.parse(answer.choices?.[0]?.message?.content||'');}
    catch{throw new ServiceError(502,'CLASSIFICATION_MODEL_INVALID','云端模型未返回有效分类');}
    if(!result?.kind||!result?.role||typeof result.kind.confidence!=='number'||
      typeof result.role.confidence!=='number')
      throw new ServiceError(502,'CLASSIFICATION_MODEL_INVALID','云端模型分类字段不完整');
    result.modelVersion=version;
    for(let attempt=0;attempt<2;attempt++){
      const head=await revision(token,userID),latest=await record(token,userID,'assets',assetID);
      if(!head||!latest||latest.id!==assetID)throw new ServiceError(409,'CLASSIFICATION_STALE','素材资料已变化');
      let updated;
      try{updated=applyAIClassification(latest,result,{allowMigrationOverride:reclassify});}
      catch{throw new ServiceError(502,'CLASSIFICATION_MODEL_INVALID','云端模型分类不符合预设字典');}
      updated.updatedAt=new Date().toISOString();
      try{
        const receipt=await commit('shiye_commit_v3_guarded',token,{
          operations:[{store:'assets',action:'put',item:updated}],base_revision:head.revision,
          expected_epoch:head.account_epoch,operation_id:randomUUID(),sync_protocol_version:3});
        return {asset:updated,revision:receipt.revision};
      }catch(error){if(error.code!=='STALE_INPUT'||attempt===1)throw error;}
    }
  };
  classify.configured=ready();
  classify.project=async(token,userID,projectID)=>{
    if(!ready())throw new ServiceError(503,'CLASSIFICATION_NOT_CONFIGURED','云端整理模型尚未配置');
    if(!idPattern.test(projectID||''))throw new ServiceError(400,'INVALID_PROJECT_ID','作品编号无效');
    const original=await record(token,userID,'projects',projectID);
    if(!original||original.id!==projectID)throw new ServiceError(404,'PROJECT_NOT_FOUND','作品不存在或尚未同步');
    if(original.autoOrganized)return {title:original.title,tags:original.styleTags||[]};
    const assetIDs=[...new Set((original.candidateAssetIDs||[]).filter(id=>idPattern.test(id)))].slice(0,12);
    const materials=await Promise.all(assetIDs.map(id=>record(token,userID,'assets',id)));
    const picture=original.isSnapshot?await image(token,userID,original.snapshotBlobId,{preview:true}):null;
    const prompt='为手帐作品生成简短中文标题和最多五个检索风格标签。仅依据提供的作品和素材信息。只返回 JSON：'+
      '{"title":"春日拼贴","tags":["春日","柔和","植物"]}。作品原标题：'+
      String(original.title||'').slice(0,120)+'。素材：'+
      materials.filter(Boolean).map(item=>String(item.title||'').slice(0,80)+'（'+
        [...(item.contentTags||[]),...(item.themeTags||[]),...(item.styleTags||[])].slice(0,6).join('、')+'）').join('；');
    const content=[{type:'text',text:prompt}];
    if(picture)content.push({type:'image_url',image_url:{url:picture,detail:'low'}});
    const response=await fetcher('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',
      headers:{Authorization:'Bearer '+modelKey,'Content-Type':'application/json'},
      body:JSON.stringify({model,temperature:0,max_tokens:450,response_format:{type:'json_object'},
        messages:[{role:'user',content}]}),signal:AbortSignal.timeout(35000)});
    if(!response.ok)throw new ServiceError(503,'CLASSIFICATION_MODEL_UNAVAILABLE','云端作品分析暂不可用');
    const answer=await parse(response);let result;
    try{result=JSON.parse(answer.choices?.[0]?.message?.content||'');}
    catch{throw new ServiceError(502,'CLASSIFICATION_MODEL_INVALID','云端模型未返回有效作品整理结果');}
    if(typeof result.title!=='string'||!Array.isArray(result.tags)||
      result.tags.some(tag=>typeof tag!=='string'))
      throw new ServiceError(502,'CLASSIFICATION_MODEL_INVALID','云端模型作品整理字段无效');
    return {title:result.title.trim().slice(0,80),
      tags:[...new Set(result.tags.map(tag=>tag.trim()).filter(tag=>tag&&tag.length<=40))].slice(0,5)};
  };
  return classify;
}

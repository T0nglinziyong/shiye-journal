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
export function materialClassificationPrompt(original){
  const metadata={widthMM:original.physicalWidthMM,heightMM:original.physicalHeightMM,
    source:original.sourceIdentifier,cutout:!!original.finalMaskBlobId,
    userConfirmedType:original.categoryEvidence?.kind?.source==='user'?original.kind:null};
  return `你是手帐实物素材编目员。第一张图是当前展示方向的素材抠图；第二张图（如果有）是同一件素材未抠图的局部原图，可用于观察外边缘和承载物，不是另一件素材。只分类这件实物，不分类它画着的物品。输出一个 JSON 对象，不要解释。\n`+
    `先判断外轮廓、纸片或物件形态，再判断画面内容。透明背景、矩形裁切、白色描边、印有布纹或金属纹，都不能单独证明背胶、真实材质或制造工艺。重复图案覆盖整片的独立纸片按花纹纸分类，除非看见贴纸的模切边界或背胶证据；相机拍摄内容的独立纸片按照片分类，只有明显的拍立得相纸版式才选拍立得。依据可见形态选择最合适的类型；只有分类字典确实没有对应项才选 other。不要根据画上的图案臆造材质。\n`+
    `素材类型（必选单选）：${choices(materialKinds)}。具体类型（仅选所选素材类型下的 ID；不确定填 null）：${choices(materialKindDetails)}。\n`+
    `画面作用（选最合适的 1 项放 role，其他确实适用的放 secondaryRoles；这两处合起来是多选）：${choices(materialRoles)}。\n`+
    `内容类别（可多选；无具体内容与其他内容不并列）：${choices(contentCategories)}。版面适配（可多选，只选具体适配项）：${choices(layoutFits)}。\n`+
    `开放标签分组：${choices(tagGroups)}。仅写有图像证据的简短词，每组最多 3 个；不要在不同组重复同一词，不要把类型、尺寸、透明度、文件来源或未证实的材质写成标签。\n`+
    `分类字段用 {"id":"上列 ID","confidence":0到1}，多选字段用此对象的数组，标签字段用 {"value":"词","confidence":0到1} 的数组。缺少证据填 null 或 []，不要编造 ID。title 用“可见内容＋实物类型”写简短中文名；不确定时用中性名称。\n`+
    `JSON 格式：{"title":"花朵贴纸","titleConfidence":0.9,"kind":{"id":"sticker","confidence":0.9},"kindDetail":{"id":"sticker.subject","confidence":0.8},"role":{"id":"accent","confidence":0.8},"secondaryRoles":[],"contentCategories":[],"layoutFits":[],"contentTags":[],"themeTags":[],"styleTags":[],"colorTags":[],"materialTags":[],"moodTags":[],"tags":[],"orientation":{"deltaDegrees":0,"confidence":1}}。\n`+
    `方向仅按第一张图判断。orientation.deltaDegrees 是相对当前展示方向还需顺时针旋转的角度，只能是 0、90、-90、180；只有文字、人物或明确主体的正立方向足够确定时才给非零角度和高置信度；方向自由或模糊时填 0。\n`+
    `已知元数据（只作辅助，不优先于图像）：${JSON.stringify(metadata)}`;
}
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
    const started=performance.now();
    if(!ready())throw new ServiceError(503,'CLASSIFICATION_NOT_CONFIGURED','云端素材分类模型尚未配置');
    if(!idPattern.test(assetID||''))throw new ServiceError(400,'INVALID_ASSET_ID','素材编号无效');
    const original=await record(token,userID,'assets',assetID);
    if(!original||original.id!==assetID||original.isProjectInternal)
      throw new ServiceError(404,'ASSET_NOT_FOUND','素材不存在或尚未同步');
    const [cutout,context]=await Promise.all([
      image(token,userID,original.blobId,{preview:true}),
      image(token,userID,original.candidateFrameBlobId)]);
    const imagesReady=performance.now();
    if(!cutout)throw new ServiceError(409,'CLASSIFICATION_IMAGE_PENDING','素材图片尚未同步，请稍后重试');
    const prompt=materialClassificationPrompt(original);
    const contents=[{type:'text',text:prompt},{type:'image_url',image_url:{url:cutout,detail:'low'}}];
    if(context)contents.push({type:'image_url',image_url:{url:context,detail:'low'}});
    const response=await fetcher('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',
      headers:{Authorization:'Bearer '+modelKey,'Content-Type':'application/json'},
      body:JSON.stringify({model,thinking:{type:'disabled'},temperature:0,max_tokens:1000,response_format:{type:'json_object'},
        messages:[{role:'user',content:contents}]}),signal:AbortSignal.timeout(35000)});
    if(!response.ok)throw new ServiceError(503,'CLASSIFICATION_MODEL_UNAVAILABLE','云端素材分析暂不可用');
    const answer=await parse(response);
    let result;
    try{result=JSON.parse(answer.choices?.[0]?.message?.content||'');}
    catch{throw new ServiceError(502,'CLASSIFICATION_MODEL_INVALID','云端模型未返回有效分类');}
    if(!result?.kind||!result?.role||typeof result.kind.confidence!=='number'||
      typeof result.role.confidence!=='number')
      throw new ServiceError(502,'CLASSIFICATION_MODEL_INVALID','云端模型分类字段不完整');
    const orientation=result.orientation;
    const acceptedOrientation=orientation&&[-90,0,90,180].includes(orientation.deltaDegrees)&&
      Number.isFinite(orientation.confidence)&&orientation.confidence>=.85&&orientation.confidence<=1
      ?{deltaDegrees:orientation.deltaDegrees,confidence:orientation.confidence}:null;
    const modelReady=performance.now();
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
        console.info(JSON.stringify({type:'shiye_classification_timing',sourceMs:Math.round(imagesReady-started),
          modelMs:Math.round(modelReady-imagesReady),commitMs:Math.round(performance.now()-modelReady)}));
        return {asset:updated,revision:receipt.revision,orientation:acceptedOrientation};
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

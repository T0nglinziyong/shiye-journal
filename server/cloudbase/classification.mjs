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
  return `你是手帐实物素材编目员。第一张图是已按当前展示方向处理的单件素材抠图；第二张图（如果有）是同一件素材未抠图的局部原图，用于判断边缘和承载物。只依据这两张图分类和描述，不判断方向，不输出旋转角度，也不要求重新矫正图像。只分类这件素材，不分类它画着的物品。输出一个 JSON 对象，不要解释。\n`+
    `类型依据：有留白、横线、格子或填写区供书写记录的是便签；整片以纯色、纹理或重复花纹为主且无明确书写功能的是纸张；已有完整标题、信息或独立版式且主要供阅读展示的是卡片；真实场景的摄影画面是照片；只有独立文字或字形而没有承载卡面的是文字素材；轮廓沿人物、动物、物件或图案裁切且呈单件装饰的是贴纸。胶带须有条带或卷状形态，票据须有票证、票根或收据特征，邮票须有邮资特征，印章须有盖印特征。包装袋、信封等字典未覆盖的独立实物选 other。\n`+
    `透明背景、矩形裁切、白色描边、画面里的布纹或金属纹都不能单独证明背胶、真实材质或工艺。模糊时降低置信度，不要因为素材里画着饼干、布料或回形针就把实物类型改成食物、布料或装饰小物。\n`+
    `素材类型（必选单选）：${choices(materialKinds)}。具体类型（仅选所选素材类型下的 ID；不确定填 null）：${choices(materialKindDetails)}。\n`+
    `画面作用（选最合适的 1 项放 role，其他确实适用的放 secondaryRoles；这两处合起来是多选）：${choices(materialRoles)}。\n`+
    `内容类别（可多选；无具体内容与其他内容不并列）：${choices(contentCategories)}。版面适配（可多选，只选具体适配项）：${choices(layoutFits)}。\n`+
    `开放标签分组：${choices(tagGroups)}。有明确证据的分组写 1–5 个简短且具体的词，尽量覆盖内容、主题、风格、色彩和氛围；没有证据的分组留空。内容标签可同时写具体对象及其上位词，主题和风格分别描述场景与表现方式；不要在不同组重复同一词，不要把类型、尺寸、透明度、文件来源或未证实的材质写成标签。\n`+
    `分类字段用 {"id":"上列 ID","confidence":0到1}，多选字段用此对象的数组，标签字段用 {"value":"词","confidence":0到1} 的数组。缺少证据填 null 或 []，不要编造 ID。title 用“可见内容＋实物类型”写简短中文名；不确定时用中性名称。description 用一到两句简洁中文直接描述主体、色彩、图案和构图，不重复标题，不猜测看不出的材质、背胶或用途；模糊的小图案只写轮廓或装饰画，不猜具体人物或物种。以素材本身开头，例如“浅粉色花朵居中，花瓣边缘有白色描线。”不要写“画面中”“图中”“照片里”“这是一张”“可以看到”“整体来看”，不要用“此外”“同时”“并且”等衔接词。\n`+
    `另写 templateUseNotes（最多 100 字）：只记录从图中可见、会影响模板替换的条件，例如完整主体轮廓、印字区域是否应保留、可书写留白的位置、图案是否连续可裁切、透明度和外形。看不清就填空字符串，不凭空推断材质或可裁切性；它不是模板位置说明。给出 templateUseNotesConfidence。已有类型、画面作用、版面适配和标签仍分别填写，不在此重复。\n`+
    `JSON 格式：{"title":"花朵贴纸","titleConfidence":0.9,"description":"浅粉色花朵居中，花瓣边缘有白色描线。","descriptionConfidence":0.9,"templateUseNotes":"花朵轮廓应完整保留，周围无书写留白。","templateUseNotesConfidence":0.85,"kind":{"id":"sticker","confidence":0.9},"kindDetail":{"id":"sticker.subject","confidence":0.8},"role":{"id":"accent","confidence":0.8},"secondaryRoles":[],"contentCategories":[],"layoutFits":[],"contentTags":[],"themeTags":[],"styleTags":[],"colorTags":[],"materialTags":[],"moodTags":[],"tags":[]}。\n`+
    `已知元数据（只作辅助，不优先于图像）：${JSON.stringify(metadata)}\n`+
    `只输出上述 JSON 字段，不附加解释。`;
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
      image(token,userID,original.blobId),
      image(token,userID,original.candidateFrameBlobId)]);
    const imagesReady=performance.now();
    if(!cutout)throw new ServiceError(409,'CLASSIFICATION_IMAGE_PENDING','素材图片尚未同步，请稍后重试');
    const prompt=materialClassificationPrompt(original);
    const contents=[{type:'text',text:prompt},{type:'image_url',image_url:{url:cutout,detail:'low'}}];
    if(context)contents.push({type:'image_url',image_url:{url:context,detail:'low'}});
    const response=await fetcher('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',
      headers:{Authorization:'Bearer '+modelKey,'Content-Type':'application/json'},
      body:JSON.stringify({model,thinking:{type:'disabled'},temperature:0,max_tokens:1400,response_format:{type:'json_object'},
        messages:[{role:'user',content:contents}]}),signal:AbortSignal.timeout(35000)});
    if(!response.ok)throw new ServiceError(503,'CLASSIFICATION_MODEL_UNAVAILABLE','云端素材分析暂不可用');
    const answer=await parse(response);
    let result;
    try{result=JSON.parse(answer.choices?.[0]?.message?.content||'');}
    catch{throw new ServiceError(502,'CLASSIFICATION_MODEL_INVALID','云端模型未返回有效分类');}
    if(!result?.kind||!result?.role||typeof result.kind.confidence!=='number'||
      typeof result.role.confidence!=='number')
      throw new ServiceError(502,'CLASSIFICATION_MODEL_INVALID','云端模型分类字段不完整');
    const modelReady=performance.now();
    result.modelVersion=version;
    for(let attempt=0;attempt<2;attempt++){
      const head=await revision(token,userID),latest=await record(token,userID,'assets',assetID);
      if(!head||!latest||latest.id!==assetID)throw new ServiceError(409,'CLASSIFICATION_STALE','素材资料已变化');
      let updated;
      try{updated=applyAIClassification(latest,result,{minConfidence:.6,allowMigrationOverride:reclassify});}
      catch{throw new ServiceError(502,'CLASSIFICATION_MODEL_INVALID','云端模型分类不符合预设字典');}
      updated.updatedAt=new Date().toISOString();
      try{
        const receipt=await commit('shiye_commit_v3_guarded',token,{
          operations:[{store:'assets',action:'put',item:updated}],base_revision:head.revision,
          expected_epoch:head.account_epoch,operation_id:randomUUID(),sync_protocol_version:3});
        console.info(JSON.stringify({type:'shiye_classification_timing',sourceMs:Math.round(imagesReady-started),
          modelMs:Math.round(modelReady-imagesReady),commitMs:Math.round(performance.now()-modelReady)}));
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

import {craftAssert} from './craft-errors.js';
import {assetSourceRevision,validateRegion,sourceRegionGeometry} from './material-anatomy.js';

// Model observations are task-local creative selections, never confirmations
// of a source's physical outline or edits to the user's material library.
export function resolveVisualObservations(observations,assets,aliases,options={}){
 const result=new Map(),perAsset=new Map();
 craftAssert(Array.isArray(observations)&&observations.length<=64,'OBSERVATION_BUDGET','一次计划最多 64 个视觉选区');
 const visible=new Set(options.visualAssetIDs||[]);
 for(const observation of observations){
  craftAssert(observation&&typeof observation==='object'&&!Array.isArray(observation),'INVALID_OBSERVATION','视觉选区格式无效');
  craftAssert(Object.keys(observation).every(key=>['id','asset','sourceRevision','kind','label','boundsRatio','outlineRatio'].includes(key)),'INVALID_OBSERVATION','视觉选区不能修改确认状态、权限或来源');
  const asset=assets.find(a=>a.id===(aliases[observation.asset]||observation.asset));
  craftAssert(asset,'MISSING_SOURCE','视觉选区引用的素材不存在');
  craftAssert(visible.has(asset.id),'IMAGE_NOT_PROVIDED','此素材未提供图像；不能提交声称来自看图的选区',{assetId:asset.id});
  craftAssert(observation.sourceRevision===assetSourceRevision(asset),'STALE_REGION_SOURCE','视觉选区不是当前素材版本',{assetId:asset.id});
  const region=validateRegion({id:observation.id,kind:observation.kind,label:observation.label||'',boundsRatio:observation.boundsRatio,
   ...(observation.outlineRatio?{outlineRatio:observation.outlineRatio}:{}),status:'proposed',provenance:'model'});
  craftAssert(!result.has(region.id),'DUPLICATE_OBSERVATION','计划内视觉选区编号重复',{assetId:asset.id});
  perAsset.set(asset.id,(perAsset.get(asset.id)||0)+1);
  craftAssert(perAsset.get(asset.id)<=32,'OBSERVATION_BUDGET','单件素材最多 32 个视觉选区');
  result.set(region.id,{asset,region,sourceRevision:observation.sourceRevision});
 }
 return result;
}
export function observedRegionGeometry(observations,id,asset,{mode='bounds',marginMM=0}={}){
 const observed=observations.get(id);
 craftAssert(observed&&observed.asset.id===asset.id,'UNKNOWN_OBSERVATION','该片段没有对应的本次视觉选区',{assetId:asset.id});
 return sourceRegionGeometry(asset,observed.region,{mode,marginMM});
}
export function visualMaterialIDs(images=[],aliases={}){
 return images.flatMap((input,index)=>{
  const url=typeof input==='string'?input:input?.url;
  const key=typeof input==='string'?Object.keys(aliases)[index]:input?.asset;
  return typeof url==='string'&&url.length&&aliases[key]?[aliases[key]]:[];
 });
}
export const multimodalCraftGuide=`【GPT 看图创作：一次交付，不是一次尝试】
直接查看本次所有素材图片，识别图案、印刷词句、纹理与空白，再选择适合的取材和组合。没有用户标注也可在同一份 plan 中提交 observations，并通过 extraction.type="observed_region" 引用 observationId；每个 observation 写 asset、sourceRevision、id、kind、label、boundsRatio，可选 outlineRatio。坐标是原素材图片左上角起算的 0–1 比例；轮廓必须落在选区内。它们是模型提出的本次创作选区，不是用户确认的物理边缘，不得改变用户已保护区域或材料权限。
用户只需一次上传并接收一次最终交付。你可以在同一次工作中自行看局部、编译、预览、检查和修正，不要要求用户将草稿反复导回再导出。先考虑材料怎么用，随后排版；一次返回 observations＋pieces＋文字与图形即可，不强制先提交计划或额外请求一轮。
字小或轮廓不清时先检查原预览或局部裁片，无法确认就保留更宽边界或整件使用，不伪造图案细节。取印刷词句仍是裁原图片，不能擅自用重打字或生成图像冒充原素材。whole 可以是最佳选择，不按加工数量评分。
高级组合可用 plan.weaves=[{piece:"strip",target:"frame",holes:[0,1],front:"between"}]；需要真实两孔和足够孔宽，穿插的多个显示片段仍只消耗一件实体。复杂负形与窗口越界用 cut_shape；分离的子片使用 geometry 取材并逐件保留。
需要数字文字镂空时，可用 runtime/glyphs.cjs 读取当前环境已有且有权使用的本地字体，生成 glyph-geometry.json 数值路径，再用 cut_shape/remove/geometry。它不会随作品复制字体文件；缺字或断开的字腔需要连接桥/分片，不用白色文字假装开孔。
完成前运行任务包校验/预览工具并查看真实生成的预览。预览命令同时生成 output/画面预览.html，具备浏览器时可打开，用与拾页共用的 Canvas 渲染器导出 PNG；没有浏览器则看构图 SVG，明确环境字体差异。内部格式修复和视觉修订都在交付前完成。可编辑作品必须与预览来自同一份图层；纯成图交付走独立图片模式，不将生成 PNG 冒充可编辑纸片或真实库存。`;

import {craftAssert} from './craft-errors.js';
import {assetSourceRevision} from './material-anatomy.js';
import {normalizeGeometry,rectangleGeometry,transformGeometry,geometryIntersection,geometryBounds,expandGeometry} from './craft-topology.js';

const KINDS=new Set(['pattern','text','texture','blank','focal','edge']);
function validateObservationRegion(region){
 craftAssert(region&&typeof region==='object'&&!Array.isArray(region),'INVALID_OBSERVATION','视觉选区格式无效');
 craftAssert(typeof region.id==='string'&&/^[\p{L}\p{N}_-]{1,96}$/u.test(region.id),'INVALID_OBSERVATION','视觉选区编号无效');
 craftAssert(KINDS.has(region.kind)&&typeof region.label==='string'&&region.label.length<=120,'INVALID_OBSERVATION','视觉选区类型或名称无效');
 const b=region.boundsRatio;
 craftAssert(Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=0&&b[1]>=0&&b[2]>0&&b[3]>0&&b[0]+b[2]<=1+1e-9&&b[1]+b[3]<=1+1e-9,'INVALID_OBSERVATION','视觉选区必须位于原素材内部');
 if(region.outlineRatio!=null){
  const points=region.outlineRatio;
  craftAssert(Array.isArray(points)&&points.length>=3&&points.length<=128&&points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=b[0]-1e-9&&p[0]<=b[0]+b[2]+1e-9&&p[1]>=b[1]-1e-9&&p[1]<=b[1]+b[3]+1e-9),'INVALID_OBSERVATION','视觉轮廓必须位于选区矩形内');
  normalizeGeometry([[points]]);
 }
 return region;
}
function observationGeometry(asset,region,{mode='bounds',marginMM=0}={}){
 validateObservationRegion(region);
 craftAssert(Number.isFinite(marginMM)&&marginMM>=0&&marginMM<=20,'INVALID_MARGIN','区域留边为 0–20 mm');
 craftAssert(mode==='bounds'||mode==='outline','INVALID_REGION_MODE','取材模式必须是矩形或沿观察轮廓');
 const width=asset.physicalWidthMM,height=asset.physicalHeightMM;
 craftAssert(Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0,'MISSING_CALIBRATION','素材尺寸尚未确认');
 let geometry;
 if(mode==='outline'){
  craftAssert(region.outlineRatio?.length,'REGION_OUTLINE_MISSING','本次视觉选区没有可用轮廓',{assetId:asset.id});
  geometry=transformGeometry(normalizeGeometry([[region.outlineRatio]]),p=>[p[0]*width,p[1]*height]);
 }else {const [x,y,w,h]=region.boundsRatio;geometry=rectangleGeometry(x*width,y*height,w*width,h*height);}
 if(marginMM){
  if(mode==='bounds'){const b=geometryBounds(geometry);geometry=rectangleGeometry(b.x-marginMM,b.y-marginMM,b.width+2*marginMM,b.height+2*marginMM);}
  else geometry=expandGeometry(geometry,marginMM);
 }
 return geometryIntersection(geometry,rectangleGeometry(0,0,width,height));
}

// Model observations are task-local creative selections, never confirmations
// of a source's physical outline or edits to the user's material library.
export function resolveVisualObservations(observations,assets,aliases,options={}){
 const result=new Map(),perAsset=new Map();
 craftAssert(Array.isArray(observations)&&observations.length<=64,'OBSERVATION_BUDGET','一次计划最多 64 个视觉选区');
 const visible=new Set(options.visualAssetIDs||[]);
 for(const observation of observations){
  craftAssert(observation&&typeof observation==='object'&&!Array.isArray(observation),'INVALID_OBSERVATION','视觉选区格式无效');
  craftAssert(Object.keys(observation).every(key=>['id','asset','sourceRevision','kind','label','boundsRatio','outlineRatio'].includes(key)),'INVALID_OBSERVATION','视觉选区不能修改权限或来源');
  const asset=assets.find(a=>a.id===(aliases[observation.asset]||observation.asset));
  craftAssert(asset,'MISSING_SOURCE','视觉选区引用的素材不存在');
  craftAssert(visible.has(asset.id),'IMAGE_NOT_PROVIDED','此素材未提供图像；不能提交声称来自看图的选区',{assetId:asset.id});
  craftAssert(observation.sourceRevision===assetSourceRevision(asset),'STALE_REGION_SOURCE','视觉选区不是当前素材版本',{assetId:asset.id});
  const region=validateObservationRegion({id:observation.id,kind:observation.kind,label:observation.label||'',boundsRatio:observation.boundsRatio,
   ...(observation.outlineRatio?{outlineRatio:observation.outlineRatio}:{})});
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
 return observationGeometry(asset,observed.region,{mode,marginMM});
}
export function visualMaterialIDs(images=[],aliases={}){
 return images.flatMap((input,index)=>{
  const url=typeof input==='string'?input:input?.url;
  const key=typeof input==='string'?Object.keys(aliases)[index]:input?.asset;
  return typeof url==='string'&&url.length&&aliases[key]?[aliases[key]]:[];
 });
}
export const multimodalCraftGuide=`【GPT 看图创作：一次交付，不是一次尝试】
直接查看本次所有素材图片，识别图案、印刷词句、纹理与空白，再选择适合的取材和组合。没有用户标注也可在同一份 plan 中提交 observations，并通过 extraction.type="observed_region" 引用 observationId；每个 observation 写 asset、sourceRevision、id、kind、label、boundsRatio，可选 outlineRatio。坐标是原素材图片左上角起算的 0–1 比例；轮廓必须落在选区内。它们只服务本次创作，不写回素材库，也不能改变材料权限。
用户只需一次上传并接收一次最终交付。你可以在同一次工作中自行看局部、编译、预览、检查和修正，不要要求用户将草稿反复导回再导出。先考虑材料怎么用，随后排版；一次返回 observations＋pieces＋文字与图形即可，不强制先提交计划或额外请求一轮。
字小或轮廓不清时先检查原预览或局部裁片，无法确认就保留更宽边界或整件使用，不伪造图案细节。取印刷词句仍是裁原图片，不能擅自用重打字或生成图像冒充原素材。whole 可以是最佳选择，不按加工数量评分。
高级组合可用 plan.weaves=[{piece:"strip",target:"frame",holes:[0,1],front:"between"}]；需要真实两孔和足够孔宽，穿插的多个显示片段仍只消耗一件实体。复杂负形与窗口越界用 cut_shape；分离的子片使用 geometry 取材并逐件保留。要从尚未放入画布的同一原素材分别剪出两个人，可为每人提交一条 observed_region/outline 或 geometry 轮廓，并声明 sourcePartitions:[{asset:"m1"}]；未剪区域默认成为可再次使用的备选余料，不会复制出第二张原图。粗略取材可用 rect_crop，精细多边形可用 geometryMM 或 cut_shape/polygon。已有画布父片则用 consume + parentId 继续拆分，不能从原图再取重叠区域。
需要数字文字镂空时，可用 runtime/glyphs.cjs 读取当前环境已有且有权使用的本地字体，生成 glyph-geometry.json 数值路径，再用 cut_shape/remove/geometry。它不会随作品复制字体文件；缺字或断开的字腔需要连接桥/分片，不用白色文字假装开孔。
完成前运行任务包校验/预览工具并查看真实生成的预览。预览命令同时生成 output/画面预览.html，具备浏览器时可打开，用与拾页共用的 Canvas 渲染器导出 PNG；没有浏览器则看构图 SVG，明确环境字体差异。内部格式修复和视觉修订都在交付前完成。可编辑作品必须与预览来自同一份图层；纯成图交付走独立图片模式，不将生成 PNG 冒充可编辑纸片或真实素材来源。`;

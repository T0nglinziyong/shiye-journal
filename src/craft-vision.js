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

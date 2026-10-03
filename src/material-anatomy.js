import {craftDigest} from './craft-fingerprint.js';
import {craftAssert,craftError} from './craft-errors.js';
import {normalizeGeometry,rectangleGeometry,transformGeometry,geometryArea,geometryIntersection,geometryBounds,expandGeometry,AREA_EPSILON} from './craft-topology.js';

export const REGION_KINDS=['pattern','text','texture','blank','focal','edge'];
const KEYS=new Set(['id','kind','label','boundsRatio','outlineRatio','status','provenance','preserve']);
// The timestamp is conservative: an in-place image edit that retained its Blob
// ID still invalidates a task. Metadata editors may explicitly rebind an
// already confirmed region only after verifying the visual descriptor is equal.
export function assetVisualDescriptor(asset){
 return {assetID:asset.id,blobId:asset.blobId??null,originalBlobId:asset.originalBlobId??null,staticPath:asset.staticPath??null,
  widthMM:asset.physicalWidthMM,heightMM:asset.physicalHeightMM,imageSize:asset.imageSize??null,
  processingRecord:asset.processingRecord??null,sourceSilhouette:asset.sourceSilhouette??null,
  imageHash:asset.imageHash??asset.contentHash??null,orientation:asset.orientation??null};
}
export const assetSourceRevision=asset=>craftDigest({...assetVisualDescriptor(asset),updatedAt:asset.updatedAt??null,supply:asset.supply??{quantity:1},tapeRepeatMode:asset.tapeRepeatMode??null,tapeRepeatPeriodMM:asset.tapeRepeatPeriodMM??null});
export function materialSourceSnapshot(asset){
 return {assetID:asset.id,sourceRevision:assetSourceRevision(asset),descriptor:assetVisualDescriptor(asset),updatedAt:asset.updatedAt??null,
  kind:asset.kind,title:asset.title,role:asset.role??null,tags:asset.tags||[],supply:structuredClone(asset.supply??{quantity:1}),
  tapeRepeatMode:asset.tapeRepeatMode??null,tapeRepeatPeriodMM:asset.tapeRepeatPeriodMM??null,
  anatomy:asset.anatomy?structuredClone(asset.anatomy):null};
}
export function assetFromSourceSnapshot(snapshot){
 const d=snapshot.descriptor;
 craftAssert(d&&d.assetID===snapshot.assetID,'INVALID_SOURCE_SNAPSHOT','素材来源快照缺失或编号不一致');
 return {id:snapshot.assetID,title:snapshot.title,kind:snapshot.kind,role:snapshot.role,tags:snapshot.tags,
  blobId:d.blobId,originalBlobId:d.originalBlobId,staticPath:d.staticPath,physicalWidthMM:d.widthMM,physicalHeightMM:d.heightMM,
  imageSize:d.imageSize,processingRecord:d.processingRecord,sourceSilhouette:d.sourceSilhouette,imageHash:d.imageHash,orientation:d.orientation,
  updatedAt:snapshot.updatedAt,supply:snapshot.supply,tapeRepeatMode:snapshot.tapeRepeatMode,tapeRepeatPeriodMM:snapshot.tapeRepeatPeriodMM,anatomy:snapshot.anatomy};
}
export function validateRegion(region){
 craftAssert(region&&typeof region==='object'&&!Array.isArray(region)&&Object.keys(region).every(key=>KEYS.has(key)),'INVALID_REGION','区域含不支持的字段');
 craftAssert(typeof region.id==='string'&&/^[\p{L}\p{N}_-]{1,96}$/u.test(region.id),'INVALID_REGION','区域编号无效');
 craftAssert(REGION_KINDS.includes(region.kind)&&typeof region.label==='string'&&region.label.length<=120,'INVALID_REGION','区域类型或名称无效');
 craftAssert(['proposed','confirmed'].includes(region.status)&&['user','model'].includes(region.provenance),'INVALID_REGION','区域确认状态或来源无效');
 craftAssert(region.preserve===undefined||typeof region.preserve==='boolean','INVALID_REGION','区域保护标记无效');
 const b=region.boundsRatio;
 craftAssert(Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=0&&b[1]>=0&&b[2]>0&&b[3]>0&&b[0]+b[2]<=1+1e-9&&b[1]+b[3]<=1+1e-9,'INVALID_REGION','区域矩形必须位于原素材内部');
 if(region.outlineRatio!=null){
  const points=region.outlineRatio;
  craftAssert(Array.isArray(points)&&points.length>=3&&points.length<=128&&points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=b[0]-1e-9&&p[0]<=b[0]+b[2]+1e-9&&p[1]>=b[1]-1e-9&&p[1]<=b[1]+b[3]+1e-9),'INVALID_REGION','区域轮廓必须位于其标注矩形内');
  normalizeGeometry([[points]]);
 }
 return region;
}
export function createMaterialAnatomy(asset,regions){
 craftAssert(Number.isFinite(asset.physicalWidthMM)&&asset.physicalWidthMM>0&&Number.isFinite(asset.physicalHeightMM)&&asset.physicalHeightMM>0,'MISSING_CALIBRATION','请先确认素材毫米尺寸');
 craftAssert(Array.isArray(regions)&&regions.length<=32,'REGION_BUDGET','每件素材最多 32 个区域');
 const seen=new Set();for(const region of regions){validateRegion(region);craftAssert(!seen.has(region.id),'DUPLICATE_REGION','区域编号重复');seen.add(region.id);}
 return {version:1,sourceRevision:assetSourceRevision(asset),regions:structuredClone(regions)};
}
export function readMaterialRegions(asset,{confirmedOnly=false,strict=false}={}){
 const a=asset.anatomy;if(!a)return [];
 if(a.version!==1||a.sourceRevision!==assetSourceRevision(asset)){
  if(strict)throw craftError('STALE_REGION_SOURCE','素材图像或标定已经变化，请重新确认区域',{assetId:asset.id});
  return [];
 }
 craftAssert(Array.isArray(a.regions)&&a.regions.length<=32,'REGION_BUDGET','素材区域数量无效');
 const seen=new Set();for(const region of a.regions){validateRegion(region);craftAssert(!seen.has(region.id),'DUPLICATE_REGION','区域编号重复');seen.add(region.id);}
 return a.regions.filter(r=>!confirmedOnly||r.status==='confirmed');
}
export function sourceRegionGeometry(asset,region,{mode='bounds',marginMM=0}={}){
 validateRegion(region);
 craftAssert(Number.isFinite(marginMM)&&marginMM>=0&&marginMM<=20,'INVALID_MARGIN','区域留边为 0–20 mm');
 craftAssert(mode==='bounds'||mode==='outline','INVALID_REGION_MODE','取材模式必须是矩形或沿已确认轮廓');
 const width=asset.physicalWidthMM,height=asset.physicalHeightMM;
 craftAssert(Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0,'MISSING_CALIBRATION','素材尺寸尚未确认');
 let geometry;
 if(mode==='outline'){
  craftAssert(region.outlineRatio?.length,'REGION_OUTLINE_MISSING','该区域只有矩形，尚未确认沿图案轮廓',{assetId:asset.id});
  geometry=transformGeometry(normalizeGeometry([[region.outlineRatio]]),p=>[p[0]*width,p[1]*height]);
 }else {const [x,y,w,h]=region.boundsRatio;geometry=rectangleGeometry(x*width,y*height,w*width,h*height);}
 if(marginMM){
  if(mode==='bounds'){const b=geometryBounds(geometry);geometry=rectangleGeometry(b.x-marginMM,b.y-marginMM,b.width+2*marginMM,b.height+2*marginMM);}
  else geometry=expandGeometry(geometry,marginMM);
 }
 return geometryIntersection(geometry,rectangleGeometry(0,0,width,height));
}
export function resolveMaterialRegion(asset,{regionId,sourceRevision,mode='bounds',marginMM=0}){
 craftAssert(sourceRevision===assetSourceRevision(asset),'STALE_REGION_SOURCE','区域请求不是当前素材版本',{assetId:asset.id});
 const region=readMaterialRegions(asset,{strict:true}).find(r=>r.id===regionId);
 craftAssert(region,'UNKNOWN_REGION','素材没有该区域',{assetId:asset.id});
 craftAssert(region.status==='confirmed','REGION_NOT_CONFIRMED','此区域只是建议，尚未由用户确认',{assetId:asset.id});
 return {region,geometry:sourceRegionGeometry(asset,region,{mode,marginMM})};
}
// An output may leave a protected region untouched elsewhere in the source,
// or retain the entire region. It may not bisect its printed/subject content.
export function assertProtectedRegions(asset,output){
 for(const region of readMaterialRegions(asset,{confirmedOnly:true}).filter(r=>r.preserve)){
  const protectedArea=sourceRegionGeometry(asset,region,{mode:region.outlineRatio?'outline':'bounds'});
  const area=geometryArea(protectedArea),kept=geometryArea(geometryIntersection(output,protectedArea));
  craftAssert(kept<=AREA_EPSILON||area-kept<=AREA_EPSILON,'PROTECTED_REGION_CUT','此裁切会切断已保护的主体或印刷信息',{assetId:asset.id,constraint:region.id});
 }
}
export function rebindMetadataAnatomy(before,after,regions){
 craftAssert(craftDigest(assetVisualDescriptor(before))===craftDigest(assetVisualDescriptor(after)),'STALE_REGION_SOURCE','尺寸或图像变化后不能自动继承区域确认');
 if(regions===undefined){readMaterialRegions(before,{strict:true});regions=before.anatomy?.regions||[];}
 return createMaterialAnatomy(after,regions);
}

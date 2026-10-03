import {craftAssert} from './craft-errors.js';
import {materialMaskGeometry} from './material-mask.js';
import {resolveMaterialRegion,assetSourceRevision,assertProtectedRegions} from './material-anatomy.js';
import {normalizeGeometry,rectangleGeometry,geometryArea,geometryBounds,geometryIntersection,geometryDifference,transformGeometry,assertConnected,assertSubset,AREA_EPSILON} from './craft-topology.js';

const unclosed=ring=>ring.length>3&&Math.abs(ring[0][0]-ring.at(-1)[0])<1e-9&&Math.abs(ring[0][1]-ring.at(-1)[1])<1e-9?ring.slice(0,-1):ring;
export function maskToGeometry(mask,widthMM,heightMM){
 const geometry=materialMaskGeometry(mask);
 return geometry?normalizeGeometry([ [geometry.outer,...geometry.holes].map(r=>r.map(p=>[p[0]*widthMM,p[1]*heightMM])) ]):rectangleGeometry(0,0,widthMM,heightMM);
}
export function geometryToMask(geometry,widthMM,heightMM){
 assertConnected(geometry);
 craftAssert(widthMM>0&&heightMM>0,'INVALID_GEOMETRY','裁片标定无效');
 const rings=geometry[0].map(r=>unclosed(r).map(p=>[p[0]/widthMM,p[1]/heightMM]));
 craftAssert(rings.every(r=>r.every(p=>p.every(n=>Number.isFinite(n)&&n>=-1e-8&&n<=1+1e-8))),'SOURCE_REGION_OUTSIDE','结果超出裁片矩形');
 for(const ring of rings)for(const p of ring){p[0]=Math.max(0,Math.min(1,p[0]));p[1]=Math.max(0,Math.min(1,p[1]));}
 return {shape:'region',outer:rings[0],holes:rings.slice(1)};
}
export function itemSourceGeometry(item,asset){
 const crop=item.cropRect||{x:0,y:0,width:1,height:1};
 return transformGeometry(maskToGeometry(item.materialMask,crop.width*asset.physicalWidthMM,crop.height*asset.physicalHeightMM),p=>[p[0]+crop.x*asset.physicalWidthMM,p[1]+crop.y*asset.physicalHeightMM]);
}
export function geometryMaterialRecipe(geometry,asset){
 assertConnected(geometry);const box=geometryBounds(geometry);
 craftAssert(box.width>=2-1e-8&&box.height>=2-1e-8,'PIECE_TOO_SMALL','裁片短边不得小于 2 mm');
 const bounds=rectangleGeometry(0,0,asset.physicalWidthMM,asset.physicalHeightMM);assertSubset(geometry,bounds,{assetId:asset.id});
 const crop={x:box.x/asset.physicalWidthMM,y:box.y/asset.physicalHeightMM,width:box.width/asset.physicalWidthMM,height:box.height/asset.physicalHeightMM};
 const local=transformGeometry(geometry,p=>[p[0]-box.x,p[1]-box.y]);
 return {crop,mask:geometryToMask(local,box.width,box.height),box};
}
export function shapeCutGeometry(operation,widthMM,heightMM){
 const unit=operation.unit||'ratio',scale=p=>unit==='mm'?p:[p[0]*widthMM,p[1]*heightMM];
 craftAssert(['ratio','mm'].includes(unit),'INVALID_COORDINATE_UNIT','裁切单位必须为 ratio 或 mm');
 if(operation.shape==='geometry'){
  const geometry=normalizeGeometry(operation.geometry);
  return unit==='mm'?geometry:transformGeometry(geometry,scale);
 }
 if(operation.shape==='polygon')return normalizeGeometry([[operation.points.map(scale)]]);
 const [x,y,w,h]=operation.box||[];
 craftAssert([x,y,w,h].every(Number.isFinite)&&w>0&&h>0,'INVALID_CUT_SHAPE','裁切形状缺少有效矩形');
 const [left,top]=scale([x,y]),[width,height]=scale([w,h]);
 if(operation.shape==='rectangle')return rectangleGeometry(left,top,width,height);
 craftAssert(operation.shape==='ellipse','INVALID_CUT_SHAPE','裁切形状尚未实现');
 const count=64;
 return normalizeGeometry([[Array.from({length:count},(_,i)=>[left+width/2+width/2*Math.cos(i*Math.PI*2/count),top+height/2+height/2*Math.sin(i*Math.PI*2/count)])]]);
}
export function applyRegionOperation({operation,current,mask,asset,permission}){
 let width=current.width*asset.physicalWidthMM,height=current.height*asset.physicalHeightMM;
 let geometry=maskToGeometry(mask,width,height);
 const sourceX=current.x*asset.physicalWidthMM,sourceY=current.y*asset.physicalHeightMM;
 if(operation.op==='extract_region'){
  const resolved=resolveMaterialRegion(asset,{regionId:operation.region,sourceRevision:operation.source_revision,mode:operation.mode||'bounds',marginMM:operation.margin_mm||0});
  const available=transformGeometry(geometry,p=>[p[0]+sourceX,p[1]+sourceY]);
  assertSubset(resolved.geometry,available,{assetId:asset.id});
  const recipe=geometryMaterialRecipe(resolved.geometry,asset);current=recipe.crop;mask=recipe.mask;
 }else{
  craftAssert(operation.op==='cut_shape','UNSUPPORTED_OPERATION','未知拓扑工序');
  craftAssert(operation.mode==='keep'||operation.mode==='remove','INVALID_CUT_MODE','裁切必须明确保留还是移除');
  const cut=shapeCutGeometry(operation,width,height);
  const next=operation.mode==='keep'?geometryIntersection(geometry,cut):geometryDifference(geometry,cut);
  craftAssert(geometryArea(next)>AREA_EPSILON,'EMPTY_PIECE','此工序会移除整件素材');
  assertConnected(next);mask=geometryToMask(next,width,height);
 }
 width=current.width*asset.physicalWidthMM;height=current.height*asset.physicalHeightMM;
 geometry=maskToGeometry(mask,width,height);
 craftAssert(width>=2-1e-8&&height>=2-1e-8,'PIECE_TOO_SMALL','裁片短边不得小于 2 mm');
 const retained=geometryArea(geometry)/(asset.physicalWidthMM*asset.physicalHeightMM);
 craftAssert(permission!=='少量裁剪'||retained>=.6-1e-6,'PROCESSING_LIMIT','仅允许少量裁剪，须累计保留至少60%面积',{assetId:asset.id});
 assertProtectedRegions(asset,transformGeometry(geometry,p=>[p[0]+current.x*asset.physicalWidthMM,p[1]+current.y*asset.physicalHeightMM]));
 return {current,mask,sourceRevision:assetSourceRevision(asset)};
}

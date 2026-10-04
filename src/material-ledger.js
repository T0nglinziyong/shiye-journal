import {craftAssert} from './craft-errors.js';
import {itemSourceGeometry} from './craft-region-ops.js';
import {assetSourceRevision} from './material-anatomy.js';
import {normalizeGeometry,rectangleGeometry,geometryArea,geometryUnion,geometryIntersection,geometryDifference,assertSubset,AREA_EPSILON} from './craft-topology.js';

export const pieceKey=item=>item.creativePieceID||item.agentKey||item.key||item.id;
export function buildMaterialLedger(draft,assets){
 const catalog=new Map(assets.map(asset=>[asset.id,asset])),groups=new Map(),rolls=new Map();
 for(const item of draft.items||[]){
  const asset=catalog.get(item.assetID);craftAssert(asset,'MISSING_SOURCE','源素材不存在',{assetId:item.assetID,pieceId:pieceKey(item)});
  const unit=item.materialUnitIndex??0;
  craftAssert(Number.isInteger(unit)&&unit>=0,'INVALID_UNIT','素材库存单位无效',{assetId:asset.id});
  const isRoll=asset.kind==='tape'&&asset.supply?.kind==='tapeRoll'&&asset.tapeRepeatMode==='repeatablePattern';
  craftAssert(isRoll||unit<(asset.supply?.quantity??1),'STOCK_EXCEEDED','裁片超出实际素材数量',{assetId:asset.id});
  const geometry=itemSourceGeometry(item,asset),source=rectangleGeometry(0,0,asset.physicalWidthMM,asset.physicalHeightMM);
  assertSubset(geometry,source,{assetId:asset.id,pieceId:pieceKey(item)});
  if(isRoll){
   const remaining=asset.supply.availableLengthMM,period=asset.tapeRepeatPeriodMM;
   craftAssert(Number.isFinite(remaining)&&remaining>0&&Number.isFinite(period)&&period>0&&period<=Math.max(asset.physicalWidthMM,asset.physicalHeightMM),'UNVERIFIED_TAPE','整卷胶带缺少真实剩余长度或已确认周期',{assetId:asset.id});
   const crop=item.cropRect||{width:1,height:1};
   const length=asset.physicalWidthMM>=asset.physicalHeightMM?crop.width*asset.physicalWidthMM:crop.height*asset.physicalHeightMM;
   const roll=rolls.get(asset.id)||{assetId:asset.id,sourceRevision:assetSourceRevision(asset),availableLengthMM:remaining,usedLengthMM:0,pieces:[]};
   // A displayed duplicate still consumes another real segment. Narrowing a
   // segment never reduces its longitudinal stock charge.
   roll.pieces.push({pieceId:pieceKey(item),lengthMM:length,offsetMM:roll.usedLengthMM});roll.usedLengthMM+=length;
   craftAssert(roll.usedLengthMM<=remaining+1e-6,'INSUFFICIENT_TAPE_LENGTH','方案使用的胶带超过实际剩余长度',{assetId:asset.id});rolls.set(asset.id,roll);continue;
  }
  const groupId=JSON.stringify([asset.id,unit]);
  const group=groups.get(groupId)||{assetId:asset.id,unit,sourceRevision:assetSourceRevision(asset),sourceAreaMM2:geometryArea(source),source,allocations:[]};
  for(const prior of group.allocations)craftAssert(geometryArea(geometryIntersection(prior.geometry,geometry))<=AREA_EPSILON,'SOURCE_REGION_OVERLAP','同一实物单位的裁片重叠或重复使用',{assetId:asset.id,pieceId:pieceKey(item),constraint:prior.pieceId});
  group.allocations.push({pieceId:pieceKey(item),geometry,areaMM2:geometryArea(geometry),parked:!!item.isParked});groups.set(groupId,group);
 }
 craftAssert(Array.isArray(draft.craftScraps||[])&&(draft.craftScraps||[]).length<=256,'SCRAP_BUDGET','碎屑记录超过上限');
 for(const [index,scrap] of (draft.craftScraps||[]).entries()){
  const asset=catalog.get(scrap.assetId);craftAssert(asset,'MISSING_SOURCE','碎屑记录的来源缺失');
  craftAssert(Number.isInteger(scrap.unit)&&scrap.unit>=0&&scrap.unit<(asset.supply?.quantity??1),'INVALID_UNIT','碎屑库存单位无效');
  const source=rectangleGeometry(0,0,asset.physicalWidthMM,asset.physicalHeightMM),geometry=normalizeGeometry(scrap.geometryMM);assertSubset(geometry,source);
  const groupId=JSON.stringify([asset.id,scrap.unit]),group=groups.get(groupId)||{assetId:asset.id,unit:scrap.unit,sourceRevision:assetSourceRevision(asset),sourceAreaMM2:geometryArea(source),source,allocations:[]};
  for(const prior of group.allocations)craftAssert(geometryArea(geometryIntersection(prior.geometry,geometry))<=AREA_EPSILON,'SOURCE_REGION_OVERLAP','不可复用已记录的碎屑或废料',{assetId:asset.id});
  group.allocations.push({pieceId:'scrap-'+index,geometry,areaMM2:geometryArea(geometry),parked:true,scrap:true});groups.set(groupId,group);
 }
 const entries=[];
 for(const group of groups.values()){
  const used=geometryUnion(...group.allocations.map(a=>a.geometry)),remaining=geometryDifference(group.source,used);
  const usedAreaMM2=geometryArea(used),remainingAreaMM2=geometryArea(remaining);
  craftAssert(Math.abs(group.sourceAreaMM2-usedAreaMM2-remainingAreaMM2)<=AREA_EPSILON,'MATERIAL_CONSERVATION','源区域账本面积不守恒',{assetId:group.assetId});
  const {source:_source,...entry}=group;entries.push({...entry,usedAreaMM2,remainingAreaMM2,remaining});
 }
 return {version:1,space:'source-mm',areaToleranceMM2:AREA_EPSILON,units:entries,rolls:[...rolls.values()]};
}
export function compactMaterialLedger(ledger){
 return {version:ledger.version,space:ledger.space,areaToleranceMM2:ledger.areaToleranceMM2,
  units:ledger.units.map(({assetId,unit,sourceRevision,sourceAreaMM2,usedAreaMM2,remainingAreaMM2,allocations})=>({assetId,unit,sourceRevision,sourceAreaMM2,usedAreaMM2,remainingAreaMM2,pieces:allocations.map(({pieceId,areaMM2,parked})=>({pieceId,areaMM2,parked}))})),rolls:ledger.rolls};
}

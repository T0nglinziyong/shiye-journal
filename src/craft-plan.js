import {compileTwoHoleWeaves} from './craft-display.js';
import {resolveVisualObservations,observedRegionGeometry} from './craft-vision.js';
import {normalizeGeometry,geometryBounds} from './craft-topology.js';
import {craftAssert} from './craft-errors.js';
import {craftDigest,craftSceneHash,isManagedUnchanged} from './craft-fingerprint.js';
import {assetSourceRevision,resolveMaterialRegion,readMaterialRegions,sourceRegionGeometry} from './material-anatomy.js';
import {itemSourceGeometry,geometryMaterialRecipe} from './craft-region-ops.js';
import {buildMaterialLedger,compactMaterialLedger,pieceKey} from './material-ledger.js';
import {geometryDifference,geometryUnion,geometryArea,assertSubset,AREA_EPSILON} from './craft-topology.js';

const HASH=/^sha256:[a-f0-9]{64}$/;
const lookup=(assets,aliases,key)=>assets.find(a=>a.id===(aliases[key]||key));
const recipeOperations=(geometry,asset)=>{
 const {crop,mask,box}=geometryMaterialRecipe(geometry,asset);
 if(!mask.holes.length&&Math.abs(geometryArea(geometry)-box.width*box.height)<=AREA_EPSILON)return [{op:'crop',box:{unit:'ratio',mode:'keep',values:[crop.x,crop.y,crop.width,crop.height]}}];
 return [{op:'crop',box:{unit:'ratio',mode:'keep',values:[crop.x,crop.y,crop.width,crop.height]}},
  {op:'cut_shape',shape:'geometry',mode:'keep',unit:'ratio',geometry:[[mask.outer,...mask.holes]]}];
};
function plannedMaterial(piece,asset,draft,observations){
 const extraction=piece.extraction||{type:'whole'},operations=[];
 if(extraction.type==='rect_crop'){
  operations.push({op:'crop',box:{unit:'mm',mode:'keep',values:extraction.boxMM}});
 }else if(extraction.type==='region'){
  const result=resolveMaterialRegion(asset,{regionId:extraction.regionId,sourceRevision:piece.sourceRevision,mode:extraction.mode||'bounds',marginMM:extraction.marginMM||0});
  operations.push(...recipeOperations(result.geometry,asset));
 }else if(extraction.type==='observed_region'){
  operations.push(...recipeOperations(observedRegionGeometry(observations,extraction.observationId,asset,{mode:extraction.mode||'bounds',marginMM:extraction.marginMM||0}),asset));
 }else if(extraction.type==='geometry'){
  operations.push(...recipeOperations(normalizeGeometry(extraction.geometryMM),asset));
 }else craftAssert(extraction.type==='whole','INVALID_EXTRACTION','取材方式尚未实现',{pieceId:piece.id});
 // An outline extraction already has an outer boundary: Boolean cuts can be
 // composed with it; a second parameterized rectangular edge cannot invent
 // a new source rectangle. The ordinary executor enforces this order.
 if(!operations.length)operations.push({op:'whole'});
 operations.push(...(piece.treatments||[]));
 craftAssert(operations.length<=12,'OPERATION_BUDGET','单片复合工序超过 12 步',{pieceId:piece.id});
 const scale=draft.canvas.height/draft.physicalPageHeightMM,center=piece.centerMM||[draft.canvas.width/scale/2,draft.physicalPageHeightMM/2];
 return {asset:piece.asset,piece:piece.id,unit:piece.unit??0,operations,
  placement:{x:center[0]*scale/draft.canvas.width,y:center[1]*scale/draft.canvas.height,rotation:piece.rotationDeg??0,z:piece.z??10},relation:piece.relation??null};
}
// The caller operates on its per-command clone. The API below is the existing
// executor's local functions, not network calls or independently committed UI
// actions. A failure in any child restores the entire outer tool snapshot.
export function applyCraftPlan({draft,plan,assets,aliases,options,api}){
 craftAssert(plan.format==='shiye-craft-plan'&&plan.version===2&&typeof plan.commandId==='string'&&plan.commandId.length<=96,'INVALID_CRAFT_PLAN','工艺计划格式或命令编号无效');
 craftAssert(HASH.test(plan.baseSceneHash),'INVALID_SCENE_BASE','工艺计划缺少明确场景基线');
 const inputHash=craftDigest(plan),currentHash=craftSceneHash(draft);
 const prior=(draft.craftReceipts||[]).find(r=>r.commandId===plan.commandId);
 if(prior){
  craftAssert(prior.inputHash===inputHash,'COMMAND_ID_REUSED','同一命令编号不能用于另一份计划');
  craftAssert(prior.resultHash===currentHash,'STALE_REPLAY','原计划完成后画布已改变，未重放旧内容');
  if(plan.finish!==false)api.finish({summary:plan.summary||'已执行的工艺计划'});
  return {detail:'该工艺计划已执行，未重复添加实体',mutation:false,data:{...prior,replayed:true}};
 }
 craftAssert(currentHash===plan.baseSceneHash,'STALE_SCENE_BASE','画布已改变，请基于当前画面修订工艺计划');
 craftAssert(Array.isArray(plan.pieces)&&plan.pieces.length>0&&plan.pieces.length<=24,'PIECE_BUDGET','复合计划需要 1–24 件明确片段');
 const keys=new Set(),parents=new Map(),consume=plan.consume||[];
 craftAssert(consume.length<=24&&new Set(consume).size===consume.length,'INVALID_CONSUMPTION','被拆分父片重复或过多');
 for(const key of consume){
  const item=(draft.items||[]).find(i=>pieceKey(i)===key||i.id===key);
  craftAssert(item,'MISSING_PARENT','被拆分父片不存在',{pieceId:key});
  craftAssert(isManagedUnchanged(item),'MANUAL_EDIT_PROTECTED','父片已手改、锁定或缺少可验证的 AI 基线；请保留原片另建方案',{pieceId:key});
  const asset=assets.find(a=>a.id===item.assetID);
  parents.set(key,{item:structuredClone(item),asset,geometry:itemSourceGeometry(item,asset)});
 }
 const observations=resolveVisualObservations(plan.observations||[],assets,aliases,options);
 const specs=[];
 for(const piece of plan.pieces){
  craftAssert(typeof piece.id==='string'&&!keys.has(piece.id),'DUPLICATE_PIECE','工艺片段编号重复');keys.add(piece.id);
  craftAssert(!consume.includes(piece.id),'PARENT_CHILD_ID_COLLISION','父片与新子片不能使用相同编号',{pieceId:piece.id});
  const existing=(draft.items||[]).find(i=>pieceKey(i)===piece.id||i.id===piece.id);
  craftAssert(!existing,'EXISTING_PIECE','工艺计划的新片段编号已在画布中；修改请明确消费父片',{pieceId:piece.id});
  const asset=lookup(assets,aliases,piece.asset);craftAssert(asset,'MISSING_SOURCE','计划引用的素材不存在',{pieceId:piece.id});
  craftAssert(piece.sourceRevision===assetSourceRevision(asset),'STALE_SOURCE','素材来源、标定或库存已变化，请重新导出任务',{assetId:asset.id,pieceId:piece.id});
  if(piece.parentId){
   const parent=parents.get(piece.parentId);
   craftAssert(parent&&parent.item.assetID===asset.id&&(parent.item.materialUnitIndex??0)===(piece.unit??0),'INVALID_PARENT_SOURCE','子片必须引用同来源、同库存单位且显式消费的父片',{pieceId:piece.id});
  }
  specs.push({piece,asset,material:plannedMaterial(piece,asset,draft,observations)});
 }
 for(const [key] of parents)craftAssert(specs.some(s=>s.piece.parentId===key),'UNCLAIMED_PARENT','消费父片必须同时给出它的子片',{pieceId:key});
 api.upsert({items:specs.map(s=>s.material),remove:consume});
 const created=new Map((draft.items||[]).map(i=>[pieceKey(i),i]));
 for(const spec of specs){
  const item=created.get(spec.piece.id);
  if(spec.piece.parentId)assertSubset(itemSourceGeometry(item,spec.asset),parents.get(spec.piece.parentId).geometry,{pieceId:spec.piece.id});
  // A piece drawn from a consumed physical parent cannot omit its lineage.
  else for(const [id,parent] of parents)if(parent.item.assetID===item.assetID&&(parent.item.materialUnitIndex??0)===(item.materialUnitIndex??0)){
   const outside=geometryDifference(itemSourceGeometry(item,spec.asset),parent.geometry);
   craftAssert(Math.abs(geometryArea(outside)-geometryArea(itemSourceGeometry(item,spec.asset)))<=AREA_EPSILON,'MISSING_PARENT_LINEAGE','取用了本次父片的区域，但没有标注 parentId',{pieceId:spec.piece.id,constraint:id});
  }
  item.craftProvenance={version:1,commandId:plan.commandId,sourceRevision:spec.piece.sourceRevision,parentId:spec.piece.parentId||null,regionId:spec.piece.extraction?.regionId||null,observation:spec.piece.extraction?.type==='observed_region'?structuredClone(observations.get(spec.piece.extraction.observationId).region):null};
 }
 const lineage=[],offcuts=[],scraps=[];
 for(const [id,parent] of parents){
  const children=specs.filter(s=>s.piece.parentId===id).map(s=>created.get(s.piece.id));
  const used=geometryUnion(...children.map(child=>itemSourceGeometry(child,parent.asset))),remaining=geometryDifference(parent.geometry,used);
  const originalArea=geometryArea(parent.geometry),childrenArea=geometryArea(used),remainingArea=geometryArea(remaining);
  craftAssert(Math.abs(originalArea-childrenArea-remainingArea)<=AREA_EPSILON,'MATERIAL_CONSERVATION','父片拆分后的面积不守恒',{pieceId:id});
  const record={parentId:id,childIds:children.map(pieceKey),sourceAreaMM2:originalArea,childAreaMM2:childrenArea,remainingAreaMM2:remainingArea,wasteAreaMM2:0};
  if(plan.keepRemainders!==false){
   for(const [index,polygon] of remaining.entries()){
    const geometry=[polygon];if(geometryArea(geometry)<=AREA_EPSILON)continue;
    const bounds=geometryBounds(geometry);
    if(bounds.width<2-1e-8||bounds.height<2-1e-8){scraps.push({parentId:id,assetId:parent.asset.id,unit:parent.item.materialUnitIndex??0,geometryMM:geometry,areaMM2:geometryArea(geometry),reason:'below-editable-piece-size'});continue;}
    const key='offcut-'+craftDigest([plan.commandId,id,index]).slice(7,31);
    offcuts.push({asset:parent.asset.id,piece:key,unit:parent.item.materialUnitIndex??0,operations:recipeOperations(geometry,parent.asset),placement:{x:.5,y:.5,rotation:parent.item.rotation||0,z:parent.item.zIndex||10},relation:null});
    record.childIds.push(key);
   }
  }else{
   // Discard is explicit in the plan; protected original regions still may
   // not be lost. A tiny or disconnected remainder never disappears silently.
   for(const region of readMaterialRegions(parent.asset,{confirmedOnly:true}).filter(r=>r.preserve)){
    const protectedGeometry=sourceRegionGeometry(parent.asset,region,{mode:region.outlineRatio?'outline':'bounds'});
    const retained=geometryArea(geometryDifference(protectedGeometry,remaining));
    craftAssert(Math.abs(retained-geometryArea(protectedGeometry))<=AREA_EPSILON,'PROTECTED_REGION_DISCARDED','计划不能把已保护区域作为损耗丢弃',{assetId:parent.asset.id,constraint:region.id});
   }
   record.wasteAreaMM2=remainingArea;
   for(const polygon of remaining){const geometry=[polygon];if(geometryArea(geometry)>AREA_EPSILON)scraps.push({parentId:id,assetId:parent.asset.id,unit:parent.item.materialUnitIndex??0,geometryMM:geometry,areaMM2:geometryArea(geometry),reason:'explicit-discard'});}
  }
  lineage.push(record);
 }
 craftAssert(offcuts.length+specs.length<=64,'OFFCUT_BUDGET','拆分产生过多余料，请分批处理');
 if(offcuts.length){api.upsert({items:offcuts,remove:[]});for(const spec of offcuts){const item=draft.items.find(i=>pieceKey(i)===spec.piece);item.isParked=true;item.craftProvenance={version:1,commandId:plan.commandId,sourceRevision:assetSourceRevision(assets.find(a=>a.id===item.assetID)),offcut:true};}}
 compileTwoHoleWeaves(draft,plan.weaves||[]);
 if(plan.paper)api.paper(plan.paper);
 if(plan.texts?.length)api.texts(plan.texts);
 if(plan.graphics?.length)api.graphics(plan.graphics);
 if(plan.ink?.length)api.ink(plan.ink);
 draft.craftScraps=[...(draft.craftScraps||[]),...scraps];
 const ledger=buildMaterialLedger(draft,assets);api.validate();
 const resultHash=craftSceneHash(draft),receipt={version:1,commandId:plan.commandId,inputHash,baseHash:currentHash,resultHash,pieces:specs.map(s=>s.piece.id),offcuts:offcuts.map(s=>s.piece),lineage,scraps,observations:plan.observations?.length||0};
 draft.craftLedger=compactMaterialLedger(ledger);draft.craftReceipts=[...(draft.craftReceipts||[]),receipt].slice(-32);
 if(plan.finish!==false)api.finish({summary:plan.summary||'工艺计划已通过源区域与实体约束'});
 return {detail:'工艺计划已原子执行；保留 '+specs.length+' 件片段及 '+offcuts.length+' 件余料',mutation:true,data:receipt};
}

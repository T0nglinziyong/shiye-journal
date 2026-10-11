import {materialSourceSnapshot,assetFromSourceSnapshot,assetSourceRevision} from './material-anatomy.js';
import {craftSceneHash,craftSceneState,craftDigest} from './craft-fingerprint.js';
import {craftAssert} from './craft-errors.js';
import {attachSceneV2,validateSceneExtensions,sceneLayerEntries} from './scene-v2.js';

export function freezeCraftTask(source,draft,assets){
 const ids=new Set(source.materials.map(m=>m.assetID));
 craftAssert((draft.items||[]).every(item=>ids.has(item.assetID)),'MISSING_BASE_SOURCE','当前草稿有未加入本次素材表的实体；请先补齐来源');
 source.sourceSnapshots=source.materials.map(({assetID})=>{
  const asset=assets.find(a=>a.id===assetID);craftAssert(asset,'MISSING_SOURCE','任务素材缺失');return materialSourceSnapshot(asset);
 });
 source.baseDraft=structuredClone(draft);source.baseSceneHash=craftSceneHash(draft);
 source.sourceVersionHash=craftDigest(source.sourceSnapshots);
 return source;
}
export function validateCraftTask(source,currentAssets,{trusted=false}={}){
 craftAssert(trusted,'TASK_NOT_TRUSTED','新工艺任务必须匹配本机登记的原始任务');
 craftAssert(Array.isArray(source.sourceSnapshots)&&source.sourceSnapshots.length===source.materials.length&&source.sourceSnapshots.length<=100,'INVALID_SOURCE_SNAPSHOT','素材来源快照不完整');
 craftAssert(craftDigest(source.sourceSnapshots)===source.sourceVersionHash,'SOURCE_SNAPSHOT_CHANGED','来源快照指纹不匹配');
 const byID=new Map(source.sourceSnapshots.map(s=>[s.assetID,s]));craftAssert(byID.size===source.materials.length,'INVALID_SOURCE_SNAPSHOT','来源快照有重复素材');
 for(const item of source.materials){
  const snapshot=byID.get(item.assetID),current=currentAssets.find(a=>a.id===item.assetID);
  craftAssert(snapshot&&current,'MISSING_SOURCE','当前素材库找不到任务素材',{assetId:item.assetID});
  craftAssert(assetSourceRevision(assetFromSourceSnapshot(snapshot))===snapshot.sourceRevision,'SOURCE_SNAPSHOT_CHANGED','来源快照与其声明版本不一致',{assetId:item.assetID});
  craftAssert(assetSourceRevision(current)===snapshot.sourceRevision,'STALE_SOURCE','导出后素材图像、尺寸或库存已变化；请重新导出任务，不覆盖旧作品',{assetId:item.assetID});
 }
 craftAssert(source.baseDraft,'INVALID_BASE_SCENE','任务缺少初始可编辑场景');
 const base=attachSceneV2(structuredClone(source.baseDraft));
 validateSceneExtensions(base);
 craftAssert(craftSceneHash(base)===source.baseSceneHash,'BASE_SCENE_CHANGED','任务起始画面指纹不匹配');
 const ids=new Set();
 for(const {kind,value:item} of sceneLayerEntries(base,{hidden:true})){
   craftAssert(typeof item.id==='string'&&/^[a-zA-Z0-9_-]{1,192}$/.test(item.id)&&!ids.has(item.id),
     'INVALID_BASE_SCENE','任务起始图层编号不安全或重复');
   ids.add(item.id);
 }

 // Every byte remains a declarative scene. Native validation and normal
 // executor validation still run before the result enters an editor.
 return base;
}
export function describeCraftSources(assets,aliases={}){
 return Object.entries(aliases).map(([alias,id])=>{
  const asset=assets.find(a=>a.id===id);if(!asset)return null;
  return {alias,sourceRevision:assetSourceRevision(asset)};
 }).filter(Boolean);
}
export function inheritCreationBrief(project,source){
 for(const key of ['contentPolicy','textPresentation','userText','providedFacts','intent','processing','assetProcessing','materialUseHints','materialUseRequired','textMode'])if(source[key]!==undefined)project[key]=structuredClone(source[key]);
 project.creationSourceVersions=structuredClone(source.sourceSnapshots);
 project.creationBaseSceneHash=source.baseSceneHash;
 return project;
}
export const craftTaskInstructions=`素材工艺计划：用 apply_craft_plan 可一次提交取材、加工、关系和父片拆分。每件素材的 sourceRevision 见 context.json 的 sourceSnapshots；场景基线见 source.baseSceneHash。新建子片使用独立 id，consume 列出父片，parentId 指回父片，默认保留的余料会进入备选。也可以继续使用普通页面或工具格式。GPT 可直接看图提出本次观察轮廓；该观察只服务本次创作，不写回素材库。图像/尺寸/库存改变后必须重新导出任务，不修改原 source 蒙混。工艺决策与制作说明不进入正文，完整使用是合法设计选择。`;

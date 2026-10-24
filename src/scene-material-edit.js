// Trusted material operations reuse production geometry + ledger validation.
// Ordinary property edits cannot use this module to bypass physical limits.
import {assertSceneEditable,findSceneNode,sceneLayerEntries} from './scene-v2.js';
import {sceneStructureTransaction} from './scene-structure-edit.js';
import {validateScenePhysical} from './creative.js';
import {replaceSceneMaterial} from './scene-advanced-ops.js';
import {reshapeTapeStrip} from './tape-strip.js';
import {materialMaskGeometry} from './material-mask.js';
import {AI_SCENE_POLICY,requireScenePolicy,assertPolicyOwnership,assertSceneCapability} from './scene-edit-policy.js';

function target(page,id,policy){requireScenePolicy(policy);const node=assertSceneEditable(page,id);assertPolicyOwnership(node,policy);if(node.type!=='material')throw Error('请选择实体素材');return node;}
export function replaceEditableMaterial(page,id,assetID,assets,{policy=AI_SCENE_POLICY}={}){
 target(page,id,policy);
 return sceneStructureTransaction(page,()=>{replaceSceneMaterial(page,id,assetID,assets);validateScenePhysical(page,assets);return findSceneNode(page,id);},{policy});
}
export function reshapeEditableTape(page,id,asset,points,options,assets,{policy=AI_SCENE_POLICY}={}){
 const node=target(page,id,policy);if(!node.tapeStrip)throw Error('请选择胶带段');
 // Geometry helper expects page-space centerline and material pose. Convert
 // through the canonical world view before applying its validated result.
 const view=sceneLayerEntries(page,{hidden:true}).find(entry=>entry.value.id===id).value;
 const next=reshapeTapeStrip(view,asset,page,points,options);
 return sceneStructureTransaction(page,()=>{Object.assign(view,next);validateScenePhysical(page,assets);return node;},{policy});
}
export function editMaterialGeometry(page,id,geometry,assets,{policy=AI_SCENE_POLICY,confirmation}={}){
 const node=target(page,id,policy);assertSceneCapability(policy,'material.geometry',[node],confirmation);
 if(!geometry||typeof geometry!=='object'||Array.isArray(geometry)||Object.keys(geometry).some(key=>!['cropRect','materialMask','craftDisplaySlices'].includes(key)))throw Error('素材裁片数据格式无效');
 const asset=assets.find(a=>a.id===node.assetID);if(!asset)throw Error('原素材不存在');
 const crop=(Object.hasOwn(geometry,'cropRect')?geometry.cropRect:node.cropRect)||{x:0,y:0,width:1,height:1};
 const mask=Object.hasOwn(geometry,'materialMask')?geometry.materialMask:node.materialMask;
 const slices=Object.hasOwn(geometry,'craftDisplaySlices')?geometry.craftDisplaySlices:node.craftDisplaySlices;
 if(['x','y','width','height'].some(key=>!Number.isFinite(crop[key]))||crop.x<0||crop.y<0||crop.width<=0||crop.height<=0||crop.x+crop.width>1+1e-9||crop.y+crop.height>1+1e-9||crop.width*asset.physicalWidthMM<2||crop.height*asset.physicalHeightMM<2)throw Error('裁片必须在原素材内，且短边不少于 2 mm');
 if(mask)materialMaskGeometry(mask);
 return sceneStructureTransaction(page,()=>{
  const oldCrop=node.cropRect||{width:1,height:1},scale=page.canvas.height/(page.physicalPageHeightMM||297);
  const sx=node.manualVisualResize?node.width/(oldCrop.width*asset.physicalWidthMM*scale):1;
  const sy=node.manualVisualResize?node.height/(oldCrop.height*asset.physicalHeightMM*scale):1;
  node.cropRect=crop.x===0&&crop.y===0&&crop.width===1&&crop.height===1?null:structuredClone(crop);node.materialMask=mask?structuredClone(mask):null;
  if(slices)node.craftDisplaySlices=structuredClone(slices);else delete node.craftDisplaySlices;
  node.width=crop.width*asset.physicalWidthMM*scale*sx;node.height=crop.height*asset.physicalHeightMM*scale*sy;
  node.manualGeometryOverride=true;node.userOverrideFlags=[...new Set([...(node.userOverrideFlags||[]),'cropRect','materialMask','craftDisplaySlices'])];
  validateScenePhysical(page,assets);return node;
 },{policy});
}
export function restoreMaterialBaseline(page,id,assets,{policy=AI_SCENE_POLICY}={}){
 const node=target(page,id,policy);if(!policy.takeover)throw Error('恢复人工参考基线只能由用户主动执行');if(!node.generationBaseline)return node;
 return sceneStructureTransaction(page,()=>{Object.assign(node,structuredClone(node.generationBaseline));delete node.manualGeometryOverride;node.userOverrideFlags=[];validateScenePhysical(page,assets);return node;},{policy});
}

import {attachSceneV2,assertSceneEditable,findSceneNode,sceneLayerEntries} from './scene-v2.js';
import {spatialPath} from './scene-spatial.js';
import {compileTwoHoleWeaves,weaveOpeningPosition} from './craft-display.js';
import {materialMaskGeometry} from './material-mask.js';
import {applySceneNodePatch} from './scene-edit-kernel.js';
import {AI_SCENE_POLICY} from './scene-edit-policy.js';

const parentID=(page,id)=>spatialPath(page.layers,id)?.ancestors.at(-1)?.id||null;
// Both Command and inspector compile on a scratch Scene, then commit only the
// display relationship through the shared edit gate. No source area is added.
export function applySceneWeave(page,id,through,{policy=AI_SCENE_POLICY}={}){
 const strip=assertSceneEditable(page,id);
 if(strip.type!=='material')throw Error('请选择一件直条实体素材');
 if(through===null)return applySceneNodePatch(page,id,{craftDisplaySlices:undefined},{policy});
 if(!Array.isArray(through)||through.some(row=>!['front','back'].includes(row.sideAfter)))throw Error('请选择有效的穿插方向');
 const parent=parentID(page,id);
 for(const entry of through){
  const target=findSceneNode(page,entry.target);
  if(!target||target.type!=='material')throw Error('穿插目标素材不存在');
  if(parentID(page,target.id)!==parent)throw Error('纸条与开孔素材需在同一组合层级；请先调整图层归属');
 }
 const trial=attachSceneV2(structuredClone(page));
 compileTwoHoleWeaves(trial,[{piece:id,through}]);
 const next=findSceneNode(trial,id);
 return applySceneNodePatch(page,id,{zIndex:next.zIndex,craftDisplaySlices:next.craftDisplaySlices},{policy});
}
export function weaveInspectorModel(page,id,asset=()=>null){
 const entries=sceneLayerEntries(page),strip=entries.find(entry=>entry.value.id===id)?.value;
 if(strip?.type!=='material'||strip.tapeStrip)return {available:false,openings:[]};
 const parent=parentID(page,id),openings=[];
 for(const {kind,value:target} of entries){
  if(kind!=='material'||target.id===id||target.craftDisplaySlices?.length||parentID(page,target.id)!==parent)continue;
  const holes=materialMaskGeometry(target.materialMask)?.holes||[];
  holes.forEach((_,hole)=>{
   const position=weaveOpeningPosition(strip,target,hole);
   openings.push({key:JSON.stringify([target.id,hole]),target:target.id,hole,position,
    label:`${target.name||target.title||asset(target.assetID)?.title||'素材'} · 孔洞 ${hole+1}`});
  });
 }
 openings.sort((a,b)=>a.position-b.position||a.key.localeCompare(b.key));
 return {available:true,applied:!!strip.craftDisplaySlices?.length,openings};
}
export function inspectorWeaveCrossings(model,keys,frontFirst=true){
 if(!Array.isArray(keys)||keys.length<2||keys.length>16||new Set(keys).size!==keys.length)throw Error('请选择 2–16 个不同孔洞');
 const selected=model.openings.filter(entry=>keys.includes(entry.key));
 if(selected.length!==keys.length)throw Error('开孔已变化，请重新选择');
 return selected.map(({target,hole},index)=>({target,hole,sideAfter:(index%2===0)===frontFirst?'front':'back'}));
}

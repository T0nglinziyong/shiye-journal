import {sceneLayerEntries} from './scene-v2.js';
import {applySceneNodeChange} from './scene-edit-kernel.js';
import {USER_SCENE_POLICY} from './scene-edit-policy.js';

// Inspector selection includes real ink leaves, including those in local groups.
// Keep the world-space view used by the other property panels.
export function inspectorSelection(page,id){
 return page?sceneLayerEntries(page).find(entry=>entry.value.id===id)||null:null;
}
export const inspectorPenStyles=[['fountain','钢笔'],['ballpoint','圆珠笔'],['brush','毛笔'],['pressure','压感笔'],['marker','荧光笔']];
export function inkInspectorStyle(id,value){
 if(id==='inspector-ink-color'){
  if(!/^#[0-9a-f]{6}$/i.test(value))throw Error('请选择有效的笔迹颜色');
  return {stroke:value};
 }
 if(id==='inspector-ink-width-mm'){
  const width=Number(value);
  if(!Number.isFinite(width)||width<.1||width>30)throw Error('笔迹粗细需在 0.1–30 mm 之间');
  return {strokeWidthMm:width};
 }
 if(id==='inspector-ink-style'){
  if(!inspectorPenStyles.some(([key])=>key===value))throw Error('请选择有效的笔迹样式');
  return {penStyle:value};
 }
 if(id==='inspector-opacity'){
  const opacity=Number(value);
  if(value===''||!Number.isFinite(opacity)||opacity<0||opacity>1)throw Error('透明度需在 0–100% 之间');
  return {opacity};
 }
 if(id==='inspector-blend-mode'){
  if(!['normal','multiply'].includes(value))throw Error('请选择有效的叠加方式');
  return {blendMode:value};
 }
 return null;
}
export function applyInkInspectorChange(page,nodeID,id,value){
 const entry=inspectorSelection(page,nodeID);
 if(entry?.kind!=='ink')throw Error('请先选择一条笔迹');
 const style=inkInspectorStyle(id,value);if(!style)return false;
 // Public style conversion distinguishes stroke width from an object's box
 // width, retaining size bindings and the original pressure/path samples.
 applySceneNodeChange(page,nodeID,{style},{policy:USER_SCENE_POLICY});
 return true;
}

import {sceneLayerEntries,findSceneNode} from './scene-v2.js';
import {applySceneNodeChange} from './scene-edit-kernel.js';
import {spatialPath} from './scene-spatial.js';
import {USER_SCENE_POLICY} from './scene-edit-policy.js';

// Inspector selection includes real ink leaves, including those in local groups.
// Keep the world-space view used by the other property panels.
export function inspectorSelection(page,id){
 if(!page)return null;
 const node=findSceneNode(page,id);
 if(node?.type==='group')return {kind:'group',value:node,parents:spatialPath(page.layers,id).ancestors};
 return sceneLayerEntries(page).find(entry=>entry.value.id===id)||null;
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

export function applyGroupInspectorChange(page,nodeID,id,value){
 const node=findSceneNode(page,nodeID);if(node?.type!=='group')throw Error('请先选择组合');
 let change;
 if(id==='inspector-group-name'){
  if(typeof value!=='string'||value.length>100)throw Error('组合名称不能超过 100 字');
  change={name:value};
 }else if(id==='inspector-opacity'||id==='inspector-blend-mode'){
  change={style:inkInspectorStyle(id,value)};
 }else if(id==='inspector-group-shadow-enabled'){
  if(typeof value!=='boolean')throw Error('阴影开关无效');
  change={style:{shadow:value?{color:'#6b665c',blurMm:1,offsetMm:[.5,.8]}:null}};
 }else if(id.startsWith('inspector-group-shadow-')){
  const s=page.canvas.height/page.physicalPageHeightMM,old=node.shadow;
  if(!old)throw Error('请先启用组合阴影');
  const shadow={color:old.color,blurMm:old.blur/s,offsetMm:[old.offsetX/s,old.offsetY/s]};
  if(id==='inspector-group-shadow-color'){
   if(!/^#[0-9a-f]{6}$/i.test(value))throw Error('请选择有效阴影颜色');shadow.color=value;
  }else{
   const n=Number(value);if(value===''||!Number.isFinite(n))throw Error('请输入有效的阴影参数');
   if(id==='inspector-group-shadow-blur'){if(n<0||n>30)throw Error('阴影模糊需在 0–30 mm 之间');shadow.blurMm=n;}
   else if(['inspector-group-shadow-x','inspector-group-shadow-y'].includes(id)){
    if(Math.abs(n)>30)throw Error('阴影偏移需在 −30–30 mm 之间');shadow.offsetMm[id.endsWith('-x')?0:1]=n;
   }else return false;
  }
  change={style:{shadow}};
 }else return false;
 applySceneNodeChange(page,nodeID,change,{policy:USER_SCENE_POLICY});return true;
}

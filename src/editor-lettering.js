// Manual adapter over the same editable title model used by Commands.
import {createLetteringGroup,reflowLettering,validateLettering} from './scene-lettering.js';
import {findSceneNode} from './scene-v2.js';
import {insertSceneLayer} from './scene-edit-kernel.js';
import {sceneStructureTransaction} from './scene-structure-edit.js';
import {applyScenePlacement} from './scene-layout.js';
import {USER_SCENE_POLICY} from './scene-edit-policy.js';
const user={policy:USER_SCENE_POLICY};
export function letteringEditorState(page,id){
 const group=findSceneNode(page,id);if(!group?.lettering)throw Error('请选择艺术标题');validateLettering(group);
 const meta=group.lettering,nodes=meta.slots.map(id=>group.children.find(n=>n.id===id));
 if(nodes.some(n=>!n||n.type!=='text')||nodes.length!==group.children.length)throw Error('标题中的字已被移出或删除；请继续逐字编辑，或新建艺术标题');
 const s=page.canvas.height/page.physicalPageHeightMM;
 return {content:nodes.map(n=>n.content).join(''),gapMm:meta.gapMm,fontSizePt:nodes[0].fontSize/s*72/25.4,letters:nodes.map((n,i)=>({id:n.id,content:n.content,rotationDeg:n.rotation||0,offsetMm:[meta.offsets[i][0]+(n.x-meta.positions[i][0])/s,meta.offsets[i][1]+(n.y-meta.positions[i][1])/s]}))};
}
export function createEditorLettering(page,id,request){
 return sceneStructureTransaction(page,()=>{
  const node=createLetteringGroup(page,{...request,id});
  node.zIndex=Math.max(0,...page.layers.map(n=>n.zIndex||0))+1;
  const added=insertSceneLayer(page,node,user);
  applyScenePlacement(page,id,{reference:'page',at:[.5,.5],unit:'ratio'});
  return added;
 },user);
}
export function reflowEditorLettering(page,id,change){return reflowLettering(page,id,change,user);}

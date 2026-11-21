import {findSceneNode} from './scene-v2.js';
import {insertSceneLayer} from './scene-edit-kernel.js';
import {AI_SCENE_POLICY,requireScenePolicy} from './scene-edit-policy.js';
// Consecutive strokes occupy one Scene layer until another object takes the top.
// Each stroke stays independent inside the group so erasing remains precise.
export const editableInkLayer=node=>!!node&&!node.locked&&!node.isLocked&&
  !node.hidden&&!node.isHidden&&!node.isParked&&!node.parked&&node.visible!==false;

export function appendInkStroke(draft,stroke,groupID,{policy=AI_SCENE_POLICY}={}){
  requireScenePolicy(policy);
  const layers=draft.layers;
  const top=[...layers].sort((a,b)=>(b.zIndex??0)-(a.zIndex??0))[0];
  if(top?.type==='group'&&top.autoInkGroup&&editableInkLayer(top)&&
    top.children?.every(node=>node.type==='ink'&&editableInkLayer(node))){
    stroke.creativeGroupID=top.id;
    stroke.zIndex=(top.children.at(-1)?.zIndex??0)+1;
    insertSceneLayer(draft,stroke,{parent:top.id,policy});
    return {root:top,replacedID:top.id};
  }
  if(top?.type==='ink'&&editableInkLayer(top)){
    if(!groupID||groupID===stroke.id||findSceneNode(draft,groupID))throw Error('笔迹组合编号重复或无效');
    const stored=insertSceneLayer(draft,stroke,{policy});
    const group={id:groupID,type:'group',name:'手写笔迹',autoInkGroup:true,
      opacity:1,blendMode:'normal',zIndex:stroke.zIndex,children:[top,stored]};
    top.creativeGroupID=group.id;
    stored.creativeGroupID=group.id;
    const index=layers.indexOf(top);
    layers.splice(layers.indexOf(stored),1);layers.splice(index,1,group);
    return {root:group,replacedID:top.id};
  }
  const stored=insertSceneLayer(draft,stroke,{policy});
  return {root:stored,replacedID:null};
}

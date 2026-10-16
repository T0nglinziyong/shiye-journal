import {attachSceneV2,assertSceneEditable,findSceneNode,removeSceneNode,sceneLayerEntries} from './scene-v2.js';

// A lasso is an editable group only when it covers every leaf in that group.
// A partial selection must not silently ungroup unselected siblings.
export function selectionGroupID(draft,ids){
  attachSceneV2(draft);
  const unique=[...new Set(ids||[])];
  if(unique.length===1&&findSceneNode(draft,unique[0])?.type==='group')return unique[0];
  if(unique.length<2)return null;
  const entries=sceneLayerEntries(draft,{hidden:true});
  const chosen=entries.filter(entry=>unique.includes(entry.value.id));
  if(chosen.length!==unique.length)return null;
  const parent=chosen[0].parents.at(-1);
  if(!parent||chosen.some(entry=>entry.parents.at(-1)?.id!==parent.id))return null;
  const members=entries.filter(entry=>entry.parents.some(group=>group.id===parent.id));
  return members.length===chosen.length?parent.id:null;
}

// A manual copy of a physical material is a visual reference to the same
// source. It stays editable in Scene but never consumes a second real sheet.
export function duplicateSceneGroup(draft,id,makeID){
  attachSceneV2(draft);
  const source=assertSceneEditable(draft,id);
  if(source.type!=='group')throw Error('请选择一个组合');
  const clone=node=>{
    const result=structuredClone(node);
    result.id=makeID();
    for(const key of ['renderKey','ownerID','sceneRenderKey','agentKey','creativePieceID',
      'key','aiManaged','craftProvenance'])delete result[key];
    if(node.type==='group'){
      result.children=(node.children||[]).map(clone);
      for(const child of result.children)child.creativeGroupID=result.id;
    }else if(node.type==='ink')result.points=(node.points||[]).map(point=>({...point,x:point.x+12,y:point.y+12}));
    else{
      result.x=(node.x||0)+12;result.y=(node.y||0)+12;
      if(result.generationBaseline){result.generationBaseline.x=result.x;
        result.generationBaseline.y=result.y;}
      if(node.type==='material')result.manualVisualCopy=true;
    }
    return result;
  };
  const copy=clone(source);
  let siblings=draft.layers,parent=null;
  const locate=(nodes,owner=null)=>{
    for(const node of nodes){
      if(node.id===id){siblings=nodes;parent=owner;return true;}
      if(node.type==='group'&&locate(node.children||[],node))return true;
    }
    return false;
  };
  locate(draft.layers);
  copy.zIndex=Math.max(0,...siblings.map(node=>node.zIndex||0))+1;
  if(parent)copy.creativeGroupID=parent.id;
  else delete copy.creativeGroupID;
  siblings.push(copy);
  return copy.id;
}

export function deleteSceneGroup(draft,id){
  const node=findSceneNode(draft,id);
  if(node?.type!=='group')throw Error('请选择一个组合');
  return removeSceneNode(draft,id);
}

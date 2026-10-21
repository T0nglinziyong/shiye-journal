import {copyEditableScene,removeEditableScene} from './scene-structure-edit.js';
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
export function duplicateSceneGroup(draft,id,makeID,context){
  const source=assertSceneEditable(draft,id);if(source.type!=='group')throw Error('请选择一个组合');
  return copyEditableScene(draft,[id],makeID,context)[0];
}
export function deleteSceneGroup(draft,id,context){
  if(findSceneNode(draft,id)?.type!=='group')throw Error('请选择一个组合');
  return removeEditableScene(draft,id,context);
}

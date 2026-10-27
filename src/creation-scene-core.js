// Internal Scene algorithms. No public command names, versioned envelopes or
// legacy field conversion live here. The creation reducer owns the transaction.
import {applyWebSceneCommands,validateWebScene} from './web-scene-workbench.js';
import {craftSceneHash} from './craft-fingerprint.js';

export const sceneScale=page=>page.canvas.height/page.physicalPageHeightMM;
export function creationNodes(nodes,out=[]){for(const node of nodes||[]){out.push(node);if(node.type==='group')creationNodes(node.children,out);}return out;}
export function creationNode(document,id){
 const node=creationNodes(document.page.layers).find(node=>[node.id,node.key,node.agentKey,node.creativePieceID].includes(id));
 if(!node)throw Error('图层不存在：'+id);return node;
}
export function creationLocation(nodes,id,parent=null){
 for(const node of nodes){if([node.id,node.key,node.agentKey,node.creativePieceID].includes(id))return {node,parent,siblings:nodes};
  if(node.type==='group'){const found=creationLocation(node.children,id,node);if(found)return found;}}
 return null;
}
export function editScene(document,edits,assets){
 return applyWebSceneCommands(document,{baseSceneHash:craftSceneHash(document.page),edits},assets);
}
export function insertSceneNode(document,node,assets,parent){
 if(creationNodes(document.page.layers).some(n=>[n.id,n.key,n.agentKey,n.creativePieceID].includes(node.id)))throw Error('图层编号已经存在：'+node.id);
 return editScene(document,[{op:'insert',node,...(parent?{parent:creationNode(document,parent).id}:{})}],assets);
}
export function patchSceneNode(document,id,values,assets){
 return Object.keys(values).length?editScene(document,[{op:'patch',id:creationNode(document,id).id,values}],assets):document;
}
// Reuse the production material/craft algorithms, not a second command parser.
export function runMaterialAlgorithm(document,name,parameters,assets){
 if(!['place_materials','edit_materials','draw_tape_strips','apply_craft_plan'].includes(name))throw Error('未登记的内部素材算法');
 // An internal split/cut is one step of a larger Command transaction. It
 // must enforce geometry and inventory now, but never finalize the artwork.
 const args=name==='apply_craft_plan'?{...parameters,finish:false}:parameters;
 return applyWebSceneCommands(document,{baseSceneHash:craftSceneHash(document.page),tools:[{name,arguments:args}]},assets);
}
export function validateCreationResult(document,assets){validateWebScene(document.page,document.source,assets,{final:false});return document;}

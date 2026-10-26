// Discrete structural edits share one policy/transaction gate. This is not
// used for pointermove or intermediate pen samples. Existing tree primitives
// keep their geometry rules; rollback restores object and array identities.
import {attachSceneV2,assertSceneEditable,findSceneNode,groupSceneLayers,ungroupSceneLayers,moveSceneNode,removeSceneNode} from './scene-v2.js';
import {solveSceneLayout,validateSceneLayout,LAYOUT_GEOMETRY_KEYS} from './scene-layout.js';
import {AI_SCENE_POLICY,requireScenePolicy,assertSceneCapability,assertPolicyOwnership} from './scene-edit-policy.js';
import {spatialPath,transformPoint,inverseMatrix,convertNodeFrame} from './scene-spatial.js';

export function sceneStructureTransaction(page,change,{policy=AI_SCENE_POLICY}={}){
 requireScenePolicy(policy);attachSceneV2(page);
 const arrays=[],states=[];
 const journal=nodes=>{arrays.push([nodes,[...nodes]]);for(const node of nodes){const {children,...rest}=node;states.push([node,structuredClone(rest),children]);if(children)journal(children);}};
 const root=page.layers;journal(root);
 // Material algorithms update these alongside nodes. A failed structural or
 // geometry transaction must not leave a new ledger/receipt on the old scene.
 const metadataKeys=['craftLedger','craftScraps','craftReceipts'];
 const metadata=new Map(metadataKeys.map(key=>[key,{exists:Object.hasOwn(page,key),value:structuredClone(page[key])}]));
 try{const result=change();validateSceneLayout(page);solveSceneLayout(page);
  // A geometry/structure edit can also move a linked object which was not
  // explicitly selected. Apply the same ownership and lock rules as patches.
  const layoutKeys=LAYOUT_GEOMETRY_KEYS;
  for(const [node,state] of states){
   const current=findSceneNode(page,node.id);
   if(!state.layoutConstraint||!current||layoutKeys.every(key=>JSON.stringify(current[key])===JSON.stringify(state[key])))continue;
   assertSceneEditable(page,current.id);assertPolicyOwnership(state,policy);
  }
  return result;}
 catch(error){page.layers=root;for(const [node,state,children] of states){for(const key of Object.keys(node))delete node[key];Object.assign(node,state);if(children)node.children=children;}
  for(const [array,values] of arrays)array.splice(0,array.length,...values);for(const [key,{exists,value}] of metadata)if(exists)page[key]=value;else delete page[key];throw error;}
}
export function assertStructureOwnership(page,targets,policy=AI_SCENE_POLICY){
 requireScenePolicy(policy);
 const inspect=node=>{assertPolicyOwnership(node,policy);node.children?.forEach(inspect);};
 targets.filter(Boolean).forEach(id=>{const node=findSceneNode(page,id);if(!node)throw Error('图层不存在：'+id);inspect(node);});
}
export function editSceneStructure(page,operation,{policy=AI_SCENE_POLICY}={}){
 requireScenePolicy(policy);
 const targets=operation.targets||[operation.target];
 assertStructureOwnership(page,targets,policy);
 return sceneStructureTransaction(page,()=>{
  if(operation.kind==='group')return groupSceneLayers(page,operation.targets,operation.options);
  if(operation.kind==='ungroup')return ungroupSceneLayers(page,operation.target);
  if(operation.kind==='move')return moveSceneNode(page,operation.target,operation.options);
  if(operation.kind==='delete'){
   const targets=[...new Set(operation.targets||[operation.target])];
   for(const id of targets)assertSceneEditable(page,id);
   // Dependents within the same deletion set must be deleted first. Never
   // silently remove links on surviving objects.
   const pending=new Set(targets);
   while(pending.size){let progress=false,lastError;
    for(const id of pending){if(!findSceneNode(page,id)){pending.delete(id);progress=true;continue;}
     try{removeSceneNode(page,id);pending.delete(id);progress=true;}catch(error){lastError=error;}}
    if(!progress)throw lastError||Error('无法删除所选图层');
   }
   return targets;
  }
  throw Error('未知结构编辑');
 },{policy});
}
export const groupEditableScene=(page,ids,options={},context)=>editSceneStructure(page,{kind:'group',targets:ids,options},context);
export const ungroupEditableScene=(page,id,context)=>editSceneStructure(page,{kind:'ungroup',target:id},context);
export const moveEditableScene=(page,id,options={},context)=>editSceneStructure(page,{kind:'move',target:id,options},context);
export const removeEditableScene=(page,id,context)=>editSceneStructure(page,{kind:'delete',target:id},context);

// Copy a visual reference only after an explicit host confirmation. The source
// ledger and unit identity never change; an AI caller cannot grant itself this.
export function copyEditableScene(page,ids,makeID,{policy=AI_SCENE_POLICY,confirmation,offset={x:12,y:12}}={}){
 requireScenePolicy(policy);
 const sources=[...new Set(ids)].map(id=>assertSceneEditable(page,id));
 if(sources.some(node=>spatialPath(page.layers,node.id).ancestors.some(parent=>sources.includes(parent))))throw Error('不能同时复制组合和它的子节点');
 const all=[];const walk=node=>{assertPolicyOwnership(node,policy);all.push(node);node.children?.forEach(walk);};sources.forEach(walk);
 assertSceneCapability(policy,'material.visualCopy',all,confirmation);
 const remap=new Map(),used=new Set();
 for(const node of all){const id=makeID();if(typeof id!=='string'||!id||used.has(id)||findSceneNode(page,id))throw Error('复制图层编号重复或无效');used.add(id);remap.set(node.id,id);}
 return sceneStructureTransaction(page,()=>{
  const clone=node=>{
   const value=structuredClone(node);value.id=remap.get(node.id);
   for(const key of ['renderKey','ownerID','sceneRenderKey','agentKey','creativePieceID','key','aiManaged','craftProvenance'])delete value[key];
   // Copy keeps the current resolved pose; retaining a link to the original
   // could snap the copy straight back on the next layout solve.
   delete value.layoutConstraint;
   if(node.type==='material')value.manualVisualCopy=true;
   if(node.children){value.children=node.children.map(clone);value.children.forEach(child=>child.creativeGroupID=value.id);}
   return value;
  };
  return sources.map(source=>{
   const copy=clone(source),path=spatialPath(page.layers,source.id),parent=path.ancestors.at(-1);
   const localOffset=transformPoint(inverseMatrix(path.parentWorld),offset.x+path.parentWorld[4],offset.y+path.parentWorld[5]);
   if(copy.type==='group'){
    if(copy.vectorMask&&!copy.localTransform)convertNodeFrame(copy,path.parentWorld,path.parentWorld,page.canvas);
    const translate=nodes=>{for(const node of nodes){if(node.type==='group'&&node.vectorMask&&!node.localTransform)convertNodeFrame(node,path.parentWorld,path.parentWorld,page.canvas);if(node.type==='group'&&node.localTransform){node.localTransform[4]+=localOffset.x;node.localTransform[5]+=localOffset.y;}else if(node.children)translate(node.children);else if(node.type==='ink')node.points=node.points.map(p=>({...p,x:p.x+localOffset.x,y:p.y+localOffset.y}));else{node.x+=localOffset.x;node.y+=localOffset.y;}}};
    if(copy.localTransform){copy.localTransform[4]+=localOffset.x;copy.localTransform[5]+=localOffset.y;}else translate(copy.children);
   }else if(copy.type==='ink')copy.points=copy.points.map(p=>({...p,x:p.x+localOffset.x,y:p.y+localOffset.y}));
   else{copy.x+=localOffset.x;copy.y+=localOffset.y;}
   const refreshBaseline=node=>{if(node.type==='material'&&node.generationBaseline)Object.assign(node.generationBaseline,{x:node.x,y:node.y,width:node.width,height:node.height,rotation:node.rotation||0});node.children?.forEach(refreshBaseline);};refreshBaseline(copy);
   const siblings=parent?.children||page.layers;copy.zIndex=Math.max(0,...siblings.map(n=>n.zIndex||0))+1;
   if(parent)copy.creativeGroupID=parent.id;else delete copy.creativeGroupID;
   siblings.push(copy);return copy.id;
  });
 },{policy});
}

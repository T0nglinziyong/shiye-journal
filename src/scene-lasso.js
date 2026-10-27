import {scaleTextEffects} from './text-effects.js';
import {copyEditableScene,editSceneStructure,sceneStructureTransaction,assertStructureOwnership} from './scene-structure-edit.js';
import {applyScenePatchBatch,sceneWorldValues} from './scene-edit-kernel.js';
import {AI_SCENE_POLICY} from './scene-edit-policy.js';
import {objectCorners,polygonContains,selectionBounds} from './canvas-selection.js';
import {sceneLayerEntries,findSceneNode,moveSceneNode,groupSceneLayers,assertSceneEditable} from './scene-v2.js';
import {pressureInkOutline} from './pressure-ink.js';
import {spatialPath,worldBox} from './scene-spatial.js';

const edges=points=>points.map((point,index)=>[point,points[(index+1)%points.length]]);
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const intersect=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&
  Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))&&
  Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y));
const polygonHits=(a,b)=>a.some(point=>polygonContains(point,b))||b.some(point=>polygonContains(point,a))||
  edges(a).some(([p,q])=>edges(b).some(([r,s])=>intersect(p,q,r,s)));
const validPoints=points=>Array.isArray(points)&&points.length>0&&points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
const inkFramePoints=node=>{
  if(node.penStyle==='pressure'){
    const outline=pressureInkOutline(node);
    if(outline.length)return outline.map(([x,y])=>({x,y}));
  }
  const radius=Math.max(.05,(node.width||3)*(node.penStyle==='brush'?.625:.5));
  return (node.points||[]).flatMap(({x,y})=>[
    {x:x-radius,y:y-radius},{x:x+radius,y:y+radius}]);
};
const pruneEmptyGroups=nodes=>{
  for(let index=nodes.length-1;index>=0;index--){
    const node=nodes[index];if(node.type!=='group')continue;
    pruneEmptyGroups(node.children||[]);
    if(!node.children?.length)nodes.splice(index,1);
  }
};
const editableSelection=(draft,ids)=>{
  const nodes=[];
  try{for(const id of new Set(ids)){
    const node=assertSceneEditable(draft,id);
    if(node.type==='group')return null;
    nodes.push(sceneLayerEntries(draft,{hidden:true}).find(entry=>entry.value.id===node.id)?.value||node);
  }}catch{return null;}
  return nodes;
};

export function selectSceneLasso(draft,polygon,filter={},mode='contain'){
  if(!validPoints(polygon)||polygon.length<3)return [];
  const bounds=selectionBounds(polygon);
  if(bounds.width<1||bounds.height<1)return [];
  return sceneLayerEntries(draft).filter(({kind,value,parents})=>{
    if(filter[kind]===false||kind==='ink'&&filter.lockInk||value.locked||value.isLocked||
      parents.some(parent=>parent.locked||parent.isLocked))return false;
    const points=kind==='ink'?value.points||[]:objectCorners(value);
    if(!validPoints(points))return false;
    if(mode==='intersect')return kind==='ink'?points.some(point=>polygonContains(point,polygon))||
      points.slice(1).some((point,index)=>edges(polygon).some(([a,b])=>intersect(points[index],point,a,b))):
      polygonHits(polygon,points);
    return points.every(point=>polygonContains(point,polygon));
  }).map(entry=>entry.value.id);
}

export function moveSceneLasso(draft,ids,dx,dy,options={}){
  if(!Number.isFinite(dx)||!Number.isFinite(dy))return false;
  return transformSceneLasso(draft,ids,{x:0,y:0},1,0,{...options,to:{x:dx,y:dy}});
}

export function sceneLassoBounds(draft,ids){
  const selected=new Set(ids),points=[];
  for(const {kind,value,parents} of sceneLayerEntries(draft)){
    if(!selected.has(value.id)&&!parents.some(parent=>selected.has(parent.id)))continue;
    points.push(...(kind==='ink'?inkFramePoints(value):objectCorners(value)));
  }
  if(!points.length)return null;
  const bounds=selectionBounds(points);
  return bounds;
}

export function transformSceneLasso(draft,ids,center,scale,degrees,{to=center,policy=AI_SCENE_POLICY,confirmation}={}){
  if(!(scale>0)||!Number.isFinite(scale)||!Number.isFinite(degrees)||
    ![center?.x,center?.y,to?.x,to?.y].every(Number.isFinite))return false;
  const nodes=editableSelection(draft,ids);if(!nodes?.length)return false;
  const radians=degrees*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
  const around=point=>({x:to.x+scale*((point.x-center.x)*c-(point.y-center.y)*s),
    y:to.y+scale*((point.x-center.x)*s+(point.y-center.y)*c)});
  const changes=nodes.map(node=>{
    let values;
    if(node.type==='ink')values={points:node.points.map(point=>({...point,...around(point)})),width:node.width*scale,
      layoutRotation:worldBox(draft,node.id).rotation+degrees};
    else{
      values={...around(node),width:node.width*scale,height:node.height*scale,rotation:(node.rotation||0)+degrees};
      if(node.type==='text'){
        if(node.textOutline){const effect={textOutline:structuredClone(node.textOutline)};scaleTextEffects(effect,scale);values.textOutline=effect.textOutline;}
        for(const field of ['fontSize','fixedLineHeight','lineHeight','lineSpacing','additionalLineSpacing','paragraphSpacing','letterSpacing','curveHeight'])if(Number.isFinite(node[field]))values[field]=node[field]*scale;
        if(node.textLayout)values.textLayout={...node.textLayout,minimumHeight:node.textLayout.minimumHeight*scale};
      }
      if(node.type==='shape'&&Number.isFinite(node.lineWidth))values.lineWidth=node.lineWidth*scale;
    }
    // Drop unchanged fields: a translation must not introduce a text sizing
    // intent or accumulate layout metadata on every pointer release.
    values=Object.fromEntries(Object.entries(values).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(node[key])));
    return {id:node.id,values:sceneWorldValues(draft,node.id,values)};
  });
  try{applyScenePatchBatch(draft,changes,{policy,confirmation,linked:'offset'});return true;}catch(error){
    if(error.code==='EDIT_CONFIRMATION_REQUIRED'||error.code==='EDIT_POLICY_INVALID')throw error;
    return false;
  }
}
export function rotateSceneLasso(draft,ids,center,degrees,options){return transformSceneLasso(draft,ids,center,1,degrees,options);}

export function copySceneLasso(draft,ids,makeID,context){return copyEditableScene(draft,ids,makeID,context);}
export function deleteSceneLasso(draft,ids,context){
 return sceneStructureTransaction(draft,()=>{editSceneStructure(draft,{kind:'delete',targets:ids},context);pruneEmptyGroups(draft.layers);},context);
}

// Lasso merge brings the selected fragments together at the front of their
// common parent. Whole selected subtrees stay intact, including group effects.
// A partial selection may cross neutral containers, never discard effects.
export function mergeSceneLasso(draft,ids,{id,name='套索组合'}={},context){
 return sceneStructureTransaction(draft,()=>{
  if(!id||findSceneNode(draft,id))throw Error('组合编号重复或无效');
  const selected=new Set(ids),entries=sceneLayerEntries(draft,{hidden:true});
  const chosen=entries.filter(entry=>selected.has(entry.value.id));
  if(chosen.length<2||chosen.length!==selected.size)throw Error('请选择至少两个可编辑图层');
  chosen.forEach(entry=>assertSceneEditable(draft,entry.value.id));
  const ancestors=chosen[0].parents.filter((parent,index)=>chosen.every(entry=>entry.parents[index]===parent));
  const parent=ancestors.at(-1),targets=[];
  const walk=nodes=>{for(const node of [...nodes].sort((a,b)=>(a.zIndex??(a.type==='ink'?2000:0))-(b.zIndex??(b.type==='ink'?2000:0)))){
   if(node.type!=='group'){if(selected.has(node.id))targets.push(node.id);continue;}
   const leaves=entries.filter(entry=>entry.parents.includes(node));
   const count=leaves.filter(entry=>selected.has(entry.value.id)).length;
   if(!count)continue;
   if(count===leaves.length){targets.push(node.id);continue;}
   if((node.opacity??1)!==1||!['normal','source-over',undefined].includes(node.blendMode)||node.shadow||
      node.vectorMask||node.materialMask||node.clipPath||node.hidden||node.isHidden)
    throw Error('所选图层跨过带外观效果的组合，请选中完整组合后再合并，以保留透明度、阴影或遮罩');
   walk(node.children||[]);
  }};
  walk(parent?.children||draft.layers);
  // Moving only when necessary also retains the sibling slot for ordinary
  // same-parent grouping. No intermediate delete can break linked references.
  assertStructureOwnership(draft,targets,context?.policy||AI_SCENE_POLICY);
  const crossing=targets.some(target=>(spatialPath(draft.layers,target).ancestors.at(-1)||null)!==(parent||null));
  if(crossing)for(const target of targets)moveSceneNode(draft,target,{parentID:parent?.id||null});
  return groupSceneLayers(draft,targets,{id,name,allowReorder:true});
 },context);
}

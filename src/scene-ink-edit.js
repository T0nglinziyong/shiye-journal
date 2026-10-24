// Erasing uses the same Scene tree and policy boundary as AI geometry edits.
// Sample collection is a UI concern; this function runs once at pen-up.
import {sceneLayoutJournal} from './scene-edit-kernel.js';
import {erasePressureStroke} from './pressure-ink.js';
import {sceneLayerEntries,findSceneNode,assertSceneEditable} from './scene-v2.js';
import {spatialPath,inverseMatrix,transformPoint} from './scene-spatial.js';
import {assertNoLinkedDependents,solveSceneLayout} from './scene-layout.js';
import {AI_SCENE_POLICY,requireScenePolicy,assertPolicyOwnership} from './scene-edit-policy.js';
export function eraseSceneInk(page,points,radius,{policy=AI_SCENE_POLICY,wholeStroke=false}={}){
 requireScenePolicy(policy);
 if(!Array.isArray(points)||!points.length||!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))||!(radius>0&&Number.isFinite(radius)))throw Error('橡皮路径或半径无效');
 const changes=[],roots=new Set(),added=new Set();
 for(const entry of sceneLayerEntries(page)){
  if(entry.kind!=='ink')continue;
  try{assertSceneEditable(page,entry.value.id);}catch{continue;}
  const raw=findSceneNode(page,entry.value.id),world={...raw,points:entry.value.points};
  const fragments=erasePressureStroke(world,points,radius),parts=wholeStroke&&fragments[0]!==world?[]:fragments;
  if(parts.length===1&&parts[0]===world)continue;
  assertPolicyOwnership(raw,policy);assertNoLinkedDependents(page,raw.id);
  const path=spatialPath(page.layers,raw.id),parent=path.ancestors.at(-1),siblings=parent?.children||page.layers;
  const inverse=inverseMatrix(path.parentWorld);
  const local=parts.map(part=>({...part,points:part.points.map(p=>({...p,...transformPoint(inverse,p.x,p.y)}))}));
  changes.push({siblings,index:siblings.indexOf(raw),raw,local});
  roots.add(path.ancestors[0]?.id||raw.id);if(!parent)local.forEach(part=>added.add(part.id));
 }
 // All validation occurs before any array is touched. Stable IDs/pressure and
 // local coordinates are preserved, including rotated/nested groups.
 const ids=new Set();for(const {raw,local} of changes)for(const part of local){
  if(ids.has(part.id)||findSceneNode(page,part.id)&&part.id!==raw.id)throw Error('擦除裁片编号冲突');ids.add(part.id);
 }
 const applied=[],restoreLayout=sceneLayoutJournal(page);
 try{
  for(const change of [...changes].sort((a,b)=>b.index-a.index)){
   change.siblings.splice(change.index,1,...change.local);applied.push(change);
  }
  solveSceneLayout(page);
 }catch(error){for(const change of applied.reverse())change.siblings.splice(change.index,change.local.length,change.raw);restoreLayout();throw error;}
 return {changed:changes.length>0,roots:[...roots],added:[...added]};
}

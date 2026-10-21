import {resolveCreationPlace} from './creation-placement.js';
import {matrixAngle,setWorldPosition,spatialPath,worldBox} from './scene-spatial.js';

const nodeList=(nodes,out=[])=>{for(const node of nodes||[]){out.push(node);if(node.type==='group')nodeList(node.children,out);}return out;};
const indexNodes=nodes=>new Map(nodes.flatMap(node=>[node.id,node.key,node.agentKey,node.creativePieceID].filter(Boolean).map(key=>[key,node])));
const parentID=(page,id)=>spatialPath(page.layers,id)?.ancestors.at(-1)?.id||null;
const dependency=(node)=>node.layoutConstraint?.place?.reference?.startsWith('node:')?node.layoutConstraint.place.reference.slice(5):null;
export function validateSceneLayout(page){
 const nodes=nodeList(page.layers),byID=indexNodes(nodes);
 if(!nodes.some(node=>node.layoutConstraint))return true;
 const visiting=new Set(),done=new Set();
 const visit=id=>{
  if(!byID.has(id))throw Error('布局参照图层不存在：'+id);
  const node=byID.get(id),key=node.id;
  if(done.has(key))return;
  if(visiting.has(key))throw Error('持续布局约束存在循环：'+id);
  visiting.add(key);
  const parent=parentID(page,key),reference=dependency(node);
  if(parent)visit(parent);
  if(reference)visit(reference);
  const place=node.layoutConstraint?.place;
  if(place){
   if(place.behavior!=='linked'||node.type==='ink')throw Error('布局约束只支持 linked 的可定位图层');
   if(place.reference==='parent'&&parent&&!byID.get(parent)?.layoutBox)throw Error('parent 比例定位需要稳定 layoutBox');
   if(node.type==='group'&&!node.layoutBox)throw Error('组合持续定位需要稳定 layoutBox');
   const box=worldBox(page,key),scale=page.canvas.height/page.physicalPageHeightMM;
   resolveCreationPlace(page,place,{widthMm:box.w/scale,heightMm:box.h/scale,parentID:parent});
  }
  visiting.delete(key);done.add(key);
 };
 for(const node of nodes)visit(node.id);
 return true;
}
export function solveSceneLayout(page){
 const nodes=nodeList(page.layers),byID=indexNodes(nodes);
 if(!nodes.some(node=>node.layoutConstraint))return true;
 validateSceneLayout(page);
 const done=new Set(),busy=new Set();
 const solve=id=>{
  const node=byID.get(id),key=node.id;
  if(done.has(key))return;
  if(busy.has(key))throw Error('持续布局约束存在循环：'+id);
  busy.add(key);
  const parent=parentID(page,key),reference=dependency(node);
  if(parent)solve(parent);if(reference)solve(reference);
  if(node.layoutConstraint){
   const current=worldBox(page,key),scale=page.canvas.height/page.physicalPageHeightMM;
   const place=node.layoutConstraint.place;
   const position=resolveCreationPlace(page,place,{widthMm:current.w/scale,heightMm:current.h/scale,rotationDeg:matrixAngle(spatialPath(page.layers,key).world)-(parent?matrixAngle(spatialPath(page.layers,parent).world):0),parentID:parent});
   setWorldPosition(page,key,position);
  }
  busy.delete(key);done.add(key);
 };
 for(const node of nodes)solve(node.id);
 return true;
}
export function applyScenePlacement(page,id,place){
 const path=spatialPath(page.layers,id);if(!path)throw Error('定位图层不存在：'+id);
 const node=path.node,parent=parentID(page,id),box=worldBox(page,id),scale=page.canvas.height/page.physicalPageHeightMM;
 const position=resolveCreationPlace(page,place,{widthMm:box.w/scale,heightMm:box.h/scale,rotationDeg:matrixAngle(path.world)-(parent?matrixAngle(spatialPath(page.layers,parent).world):0),parentID:parent});
 setWorldPosition(page,id,position);
 if(place.behavior==='linked')node.layoutConstraint={place:structuredClone(place)};
 else delete node.layoutConstraint;
 solveSceneLayout(page);
 return node;
}
export function detachSceneLayout(page,id){
 const node=spatialPath(page.layers,id)?.node;if(!node)throw Error('定位图层不存在：'+id);
 delete node.layoutConstraint;return node;
}
export function reconcileManualSceneMove(page,id){
 const path=spatialPath(page.layers,id);if(!path)throw Error('图层不存在：'+id);
 if(path.node.layoutConstraint){
  const place=structuredClone(path.node.layoutConstraint.place),parent=parentID(page,id);
  place.rotationDeg=matrixAngle(path.world)-(parent?matrixAngle(spatialPath(page.layers,parent).world):0);
  delete place.offset;
  const box=worldBox(page,id),scale=page.canvas.height/page.physicalPageHeightMM;
  const expected=resolveCreationPlace(page,place,{widthMm:box.w/scale,heightMm:box.h/scale,rotationDeg:matrixAngle(path.world)-(parent?matrixAngle(spatialPath(page.layers,parent).world):0),parentID:parent});
  path.node.layoutConstraint.place.rotationDeg=place.rotationDeg;
  path.node.layoutConstraint.place.offset={value:[(box.cx-expected.x)/scale,(box.cy-expected.y)/scale],unit:'mm',space:'page'};
 }
 solveSceneLayout(page);
}
export function assertNoLinkedDependents(page,id){
 const selected=spatialPath(page.layers,id)?.node;
 const affected=new Set([id,selected?.id,selected?.key,selected?.agentKey,selected?.creativePieceID]);
 const descendants=spatialPath(page.layers,id)?.node;
 if(descendants?.type==='group')nodeList(descendants.children).forEach(n=>[n.id,n.key,n.agentKey,n.creativePieceID].forEach(key=>affected.add(key)));
 const dependents=nodeList(page.layers).filter(node=>!affected.has(node.id)&&affected.has(dependency(node)));
 if(dependents.length)throw Error('仍有 linked 图层引用此对象：'+dependents.map(n=>n.id).join(', '));
}

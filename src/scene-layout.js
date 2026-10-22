import {resolveCreationPlace,bindCreationRotation,creationRotationFrame,creationReferenceBox} from './creation-placement.js';
import {setWorldPosition,spatialPath,worldBox} from './scene-spatial.js';
import {resizeDigitalNode} from './scene-sizing.js';

export const LAYOUT_GEOMETRY_KEYS=Object.freeze(['x','y','rotation','width','height','localTransform','points','layoutRotation','layoutConstraint','textLayout','fixedLineHeight']);
const nodeList=(nodes,out=[])=>{for(const node of nodes||[]){out.push(node);if(node.type==='group')nodeList(node.children,out);}return out;};
const indexNodes=nodes=>new Map(nodes.flatMap(node=>[node.id,node.key,node.agentKey,node.creativePieceID].filter(Boolean).map(key=>[key,node])));
const parentID=(page,id)=>spatialPath(page.layers,id)?.ancestors.at(-1)?.id||null;
const references=node=>['place','size'].map(channel=>node.layoutConstraint?.[channel]?.reference).filter(ref=>ref?.startsWith('node:')).map(ref=>ref.slice(5));
function cleanConstraint(node){
 if(node.layoutConstraint&&!node.layoutConstraint.size)delete node.layoutConstraint.sizeAspectRatio;
 if(node.layoutConstraint&&!node.layoutConstraint.place&&!node.layoutConstraint.size)delete node.layoutConstraint;
}
function checkSize(node,size){
 if(!['shape','text','ink'].includes(node.type))throw Error('持续尺寸不能缩放实体素材或组合');
 if(!size||Object.keys(size).some(k=>!['width','height','unit','reference','aspect','behavior'].includes(k))||size.unit!=='ratio'||size.behavior!=='linked'||typeof size.reference!=='string'||!/^((page(\.left|\.right)?)|parent|node:[A-Za-z][A-Za-z0-9._-]*)$/.test(size.reference))throw Error('持续尺寸须为显式 reference、ratio、linked');
 if(size.width===undefined&&size.height===undefined)throw Error('持续尺寸需要 width 或 height');
 for(const key of ['width','height'])if(size[key]!==undefined&&!(Number.isFinite(size[key])&&size[key]>0&&size[key]<=100000))throw Error('持续尺寸比例无效');
 if(size.aspect!==undefined&&!['free','preserve'].includes(size.aspect))throw Error('持续尺寸宽高比规则无效');
}
export function bindSceneSize(page,node,size){
 if(size.behavior==='linked'){
  checkSize(node,size);const box=worldBox(page,node.id);
  node.layoutConstraint={...node.layoutConstraint,size:structuredClone(size),sizeAspectRatio:box.w/box.h};
 }else{
  if(size.behavior!==undefined&&size.behavior!=='once')throw Error('size.behavior 无效');
  if(node.layoutConstraint)delete node.layoutConstraint.size;cleanConstraint(node);
 }
 return node;
}
export function validateSceneLayout(page){
 const nodes=nodeList(page.layers),byID=indexNodes(nodes);
 if(!nodes.some(node=>node.layoutConstraint))return true;
 const visiting=new Set(),done=new Set();
 const visit=id=>{
  if(!byID.has(id))throw Error('布局参照图层不存在：'+id);
  const node=byID.get(id),key=node.id;if(done.has(key))return;if(visiting.has(key))throw Error('持续布局约束存在循环：'+id);visiting.add(key);
  const parent=parentID(page,key);if(parent)visit(parent);for(const reference of references(node))visit(reference);
  const constraint=node.layoutConstraint;
  if(constraint){
   if(!constraint||typeof constraint!=='object'||Object.keys(constraint).some(k=>!['place','size','sizeAspectRatio'].includes(k))||!constraint.place&&!constraint.size)throw Error('布局约束格式无效');
   if(constraint.size){
    checkSize(node,constraint.size);
    if(!(Number.isFinite(constraint.sizeAspectRatio)&&constraint.sizeAspectRatio>0))throw Error('持续尺寸缺少稳定宽高比');
    // Check reference semantics here, not derived dimensions against stale
    // upstream sizes. Real size/pressure limits are checked in dependency order.
    creationReferenceBox(page,constraint.size.reference,parent);
   }else if(constraint.sizeAspectRatio!==undefined)throw Error('无尺寸约束不能携带尺寸宽高比');
   const place=constraint.place;
   if(place){
    if(place.behavior!=='linked')throw Error('布局约束只支持 linked 的可定位图层');
    if(place.reference==='parent'&&parent&&!byID.get(parent)?.layoutBox)throw Error('parent 比例定位需要稳定 layoutBox');
    if(node.type==='group'&&!node.layoutBox)throw Error('组合持续定位需要稳定 layoutBox');
    const box=worldBox(page,key),scale=page.canvas.height/page.physicalPageHeightMM;
    resolveCreationPlace(page,place,{widthMm:box.w/scale,heightMm:box.h/scale,parentID:parent});
   }
  }
  visiting.delete(key);done.add(key);
 };
 for(const node of nodes)visit(node.id);return true;
}
export function solveSceneLayout(page){
 const nodes=nodeList(page.layers),byID=indexNodes(nodes);if(!nodes.some(node=>node.layoutConstraint))return true;
 validateSceneLayout(page);const done=new Set(),busy=new Set();
 const solve=id=>{
  const node=byID.get(id),key=node.id;if(done.has(key))return;if(busy.has(key))throw Error('持续布局约束存在循环：'+id);busy.add(key);
  const parent=parentID(page,key);if(parent)solve(parent);for(const reference of references(node))solve(reference);
  if(node.layoutConstraint?.size)resizeDigitalNode(page,node,node.layoutConstraint.size,parent,node.layoutConstraint.sizeAspectRatio);
  if(node.layoutConstraint?.place){
   const current=worldBox(page,key),scale=page.canvas.height/page.physicalPageHeightMM;
   const place=bindCreationRotation(page,node.layoutConstraint.place,current.rotation,parent);node.layoutConstraint.place=place;
   setWorldPosition(page,key,resolveCreationPlace(page,place,{widthMm:current.w/scale,heightMm:current.h/scale,parentID:parent}));
  }
  busy.delete(key);done.add(key);
 };
 for(const node of nodes)solve(node.id);return true;
}
export function applyScenePlacement(page,id,place,{deferSolve=false}={}){
 const path=spatialPath(page.layers,id);if(!path)throw Error('定位图层不存在：'+id);
 const node=path.node,parent=parentID(page,id),box=worldBox(page,id),scale=page.canvas.height/page.physicalPageHeightMM;
 const bound=bindCreationRotation(page,place,box.rotation,parent);
 setWorldPosition(page,id,resolveCreationPlace(page,bound,{widthMm:box.w/scale,heightMm:box.h/scale,parentID:parent}));
 if(bound.behavior==='linked')node.layoutConstraint={...node.layoutConstraint,place:structuredClone(bound)};
 else if(node.layoutConstraint)delete node.layoutConstraint.place;
 cleanConstraint(node);if(!deferSolve)solveSceneLayout(page);return node;
}
export function detachSceneLayout(page,id,scope='all'){
 const node=spatialPath(page.layers,id)?.node;if(!node)throw Error('定位图层不存在：'+id);
 if(!['all','place','size'].includes(scope))throw Error('解除约束范围无效');
 if(scope==='all')delete node.layoutConstraint;else if(node.layoutConstraint){delete node.layoutConstraint[scope];cleanConstraint(node);}return node;
}
export function reconcileManualSceneMove(page,id,{deferSolve=false}={}){
 const path=spatialPath(page.layers,id);if(!path)throw Error('图层不存在：'+id);
 if(path.node.layoutConstraint?.place){
  const place=structuredClone(path.node.layoutConstraint.place),parent=parentID(page,id);place.rotationDeg=worldBox(page,id).rotation-creationRotationFrame(page,place,parent);delete place.offset;
  const box=worldBox(page,id),scale=page.canvas.height/page.physicalPageHeightMM,expected=resolveCreationPlace(page,place,{widthMm:box.w/scale,heightMm:box.h/scale,parentID:parent});
  path.node.layoutConstraint.place.rotationDeg=place.rotationDeg;path.node.layoutConstraint.place.offset={value:[(box.cx-expected.x)/scale,(box.cy-expected.y)/scale],unit:'mm',space:'page'};
 }
 if(!deferSolve)solveSceneLayout(page);
}
export function assertNoLinkedDependents(page,id){
 const selected=spatialPath(page.layers,id)?.node;
 const affected=new Set(nodeList(selected?[selected]:[]).flatMap(n=>[n.id,n.key,n.agentKey,n.creativePieceID]));affected.add(id);
 const dependents=nodeList(page.layers).filter(node=>!affected.has(node.id)&&references(node).some(ref=>affected.has(ref)));
 if(dependents.length)throw Error('仍有 linked 图层引用此对象：'+dependents.map(n=>n.id).join(', '));
}
export function detachLinkedDependents(page,id){
 const selected=spatialPath(page.layers,id)?.node;if(!selected)throw Error('图层不存在：'+id);
 const affected=new Set(nodeList([selected]).flatMap(node=>[node.id,node.key,node.agentKey,node.creativePieceID].filter(Boolean))),result=[];
 for(const node of nodeList(page.layers))if(!affected.has(node.id)){
  let changed=false;for(const channel of ['place','size'])if(node.layoutConstraint?.[channel]?.reference?.startsWith('node:')&&affected.has(node.layoutConstraint[channel].reference.slice(5))){delete node.layoutConstraint[channel];changed=true;}
  if(changed){cleanConstraint(node);result.push(node.id);}
 }
 return result;
}

import {validateGraphicEffects} from './graphic-effects.js';
import {validateTextEffects} from './text-effects.js';
import {validateShapeOptions} from './advanced-shape-options.js';
// Shared in-memory editing kernel. No file IO, network, React, Fabric or CLI.
// Only touched nodes are copied on the frequent property-update path.
import {assertSceneEditable,findSceneNode,validateVectorMask} from './scene-v2.js';
import {spatialPath,setWorldPosition,assertRigidMatrix,transformPoint,inverseMatrix,matrixAngle} from './scene-spatial.js';
import {applyScenePlacement,solveSceneLayout,reconcileManualSceneMove,bindSceneSize,detachSceneLayout,LAYOUT_GEOMETRY_KEYS} from './scene-layout.js';
import {changedNodeProperties} from './scene-node-properties.js';
import {reflowSceneText} from './scene-text-layout.js';
import {AI_SCENE_POLICY,requireScenePolicy,assertPolicyPatch,assertPolicyOwnership} from './scene-edit-policy.js';

const textFields=new Set(['content','width','height','fontSize','fontName','style','bold','italic','lineSpacing','fixedLineHeight','paragraphSpacing','letterSpacing','curveHeight','textLayout','textOutline','textGradient']);
const forbidden=new Set(['id','type','children','assetID','sourceBlobId','sourceStaticPath','materialUnitIndex','craftProvenance','generationBaseline','aiManaged','managedFingerprint','manualVisualCopy','manualGeometryOverride']);
const common=new Set(['x','y','rotation','width','height','opacity','blendMode','shadow','hidden','isHidden','isParked','locked','isLocked','zIndex','vectorMask','vectorMaskHistory','localTransform','layoutBox','layoutRotation']);
const typed={text:new Set(['content','fontSize','fontName','style','color','alignment','bold','italic','underline','strikethrough','lineSpacing','fixedLineHeight','lineHeight','additionalLineSpacing','paragraphSpacing','letterSpacing','curveHeight','textLayout','textOutline','textGradient']),shape:new Set(['graphicOutline','graphicGradient','kind','fill','stroke','lineWidth','fillOpacity','strokeOpacity','strokeDash','cornerRadius','shapeOptions','vectorPaths','vectorLayers','vectorSize','svgPaths','svgViewBox']),ink:new Set(['graphicOutline','graphicGradient','points','color','penStyle']),material:new Set(['isFlippedHorizontally','materialRelation','craftDisplaySlices']),group:new Set(['name'])};
const copy=value=>structuredClone(value);
function replace(target,value){for(const key of Object.keys(target))if(!Object.hasOwn(value,key))delete target[key];Object.assign(target,value);}
function finiteNode(node){
 validateTextEffects(node);validateGraphicEffects(node);
 if(!Object.hasOwn(typed,node.type))throw Error('图层需要明确且有效的 type');
 for(const key of ['x','y','rotation','width','height','fontSize','lineWidth','opacity'])if(node[key]!==undefined&&(!Number.isFinite(node[key])||Math.abs(node[key])>100000))throw Error('图层数值无效：'+key);
 for(const key of ['width','height','fontSize'])if(node[key]!==undefined&&node[key]<=0)throw Error('图层尺寸必须为正：'+key);
 if(node.opacity!==undefined&&(node.opacity<0||node.opacity>1))throw Error('透明度需在 0–1 范围');
 for(const key of ['hidden','isHidden','isParked','locked','isLocked'])if(node[key]!==undefined&&typeof node[key]!=='boolean')throw Error('图层状态需为布尔值：'+key);
 if(node.type==='text'&&typeof node.content!=='string')throw Error('文字内容必须是字符串');
 if(node.type==='shape'&&node.shapeOptions!==undefined)validateShapeOptions(node.kind,node.shapeOptions);
 if(node.textLayout&&(!(node.textLayout.minimumHeight>=0&&Number.isFinite(node.textLayout.minimumHeight))||node.textLayout.lineHeightRatio!==undefined&&!(node.textLayout.lineHeightRatio>0&&Number.isFinite(node.textLayout.lineHeightRatio))))throw Error('文字布局参数无效');
 if(node.points&&(!node.points.length||node.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>100000||Math.abs(p.y)>100000)))throw Error('笔迹点无效');
 if(node.localTransform)assertRigidMatrix(node.localTransform);
 if(node.vectorMask)validateVectorMask(node.vectorMask);
}
// Rollback captures only dependency geometry, never other materials/images or
// the full point arrays of unrelated strokes.
export function sceneLayoutJournal(page){
 const records=[];
 const walk=nodes=>{for(const node of nodes){if(node.layoutConstraint)records.push([node,Object.fromEntries(LAYOUT_GEOMETRY_KEYS.filter(k=>Object.hasOwn(node,k)).map(k=>[k,copy(node[k])]))]);if(node.children)walk(node.children);}};
 walk(page.layers);
 const keys=LAYOUT_GEOMETRY_KEYS;
 const restore=()=>{for(const [node,state] of records){for(const key of keys)if(Object.hasOwn(state,key))node[key]=state[key];else delete node[key];}};
 restore.validate=(policy,explicitTargets=[])=>{
  const explicit=new Set(explicitTargets);
  for(const [node,state] of records){
   if(explicit.has(node.id)||keys.every(key=>JSON.stringify(node[key])===JSON.stringify(state[key])))continue;
   assertSceneEditable(page,node.id);
   const before={...node};for(const key of keys)if(Object.hasOwn(state,key))before[key]=state[key];else delete before[key];
   assertPolicyOwnership(before,policy);
  }
 };
 return restore;
}
function editable(page,id,values,policy){
 const path=spatialPath(page.layers,id);if(!path)throw Error('图层不存在：'+id);
 const unlocking=policy.unlock&&values.isLocked===false&&values.locked===false&&Object.keys(values).every(k=>k==='locked'||k==='isLocked');
 if(unlocking){if(path.ancestors.some(n=>n.locked||n.isLocked))throw Error('父组合已锁定，不能解锁其子图层');return path.node;}
 return assertSceneEditable(page,id);
}
export function applySceneNodePatch(page,id,values,{policy=AI_SCENE_POLICY,confirmation,place,linked='solve',reflow=true,measure,deferLayout=false,sizeSpec,preserveSize=false}={}){
 requireScenePolicy(policy);
 const node=editable(page,id,values,policy),before=copy(node),next=copy(node);
 for(const [key,value] of Object.entries(values)){
  if(['localTransform','layoutBox'].includes(key)&&node.type!=='group')throw Error('局部空间属性只适用于组合');
  if(forbidden.has(key)||!common.has(key)&&!typed[node.type]?.has(key))throw Error('受保护或不支持的图层字段：'+key);
  if(value===undefined)delete next[key];else next[key]=copy(value);
 }
 if(reflow&&node.type==='text'&&Object.keys(values).some(k=>textFields.has(k))){
  const options=node.textLayout?{}:{minimumHeight:node.height||0};
  if(Object.hasOwn(values,'height')&&!Object.hasOwn(values,'textLayout'))options.minimumHeight=values.height;
  if(Object.hasOwn(values,'fixedLineHeight')&&!Object.hasOwn(values,'textLayout')){
   next.textLayout={...next.textLayout};delete next.textLayout.lineHeightRatio;
  }
  reflowSceneText(next,options,measure);
 }
 assertPolicyPatch(before,next,{policy,confirmation});finiteNode(next);
 const restoreLayout=deferLayout?()=>{}:sceneLayoutJournal(page);
 try{
  replace(node,next);
  if(sizeSpec)bindSceneSize(page,node,sizeSpec);
  else if(!preserveSize&&policy.actor==='user'&&node.layoutConstraint?.size&&['width','height'].some(k=>Object.hasOwn(values,k)&&values[k]!==before[k]))detachSceneLayout(page,id,'size');
  if(deferLayout)return node;
  if(place){
   const binding=linked==='offset'&&before.layoutConstraint?.place?copy(before.layoutConstraint.place):null;
   applyScenePlacement(page,id,place);
   if(binding){node.layoutConstraint={...node.layoutConstraint,place:binding};reconcileManualSceneMove(page,id);}
  }else if(linked==='offset'&&['x','y','rotation','points','localTransform'].some(k=>Object.hasOwn(values,k)))reconcileManualSceneMove(page,id);
  else solveSceneLayout(page);
  restoreLayout.validate?.(policy,[id]);return node;
 }catch(error){restoreLayout();replace(node,before);throw error;}
}
export function applySceneNodeChange(page,id,change,{policy=AI_SCENE_POLICY,confirmation,linked='solve',created=false,measure}={}){
 const path=spatialPath(page.layers,id);if(!path)throw Error('图层不存在：'+id);
 const values=changedNodeProperties(page,path.node,change,path.ancestors.at(-1)?.id,{policy,confirmation});
 const place=created&&change.place?{...change.place,rotationDeg:change.place.rotationDeg??0}:change.place;
 return applySceneNodePatch(page,id,values,{policy,confirmation,place,linked,reflow:false,measure,sizeSpec:change.size,preserveSize:true});
}
// Internal application adapter: UI controls already use Scene units. It does
// not add old external aliases to the Command language.
export function sceneWorldValues(page,id,values){
 const path=spatialPath(page.layers,id);if(!path)throw Error('图层不存在：'+id);
 const local=copy(values),inverse=inverseMatrix(path.parentWorld);
 if(['x','y','rotation'].some(k=>Object.hasOwn(local,k))&&path.node.type!=='ink'){
  const point=transformPoint(inverse,values.x??path.world[4],values.y??path.world[5]);
  local.x=point.x;local.y=point.y;local.rotation=(values.rotation??matrixAngle(path.world))-matrixAngle(path.parentWorld);
 }
 if(local.points&&path.node.type==='ink')local.points=local.points.map(p=>({...p,...transformPoint(inverse,p.x,p.y)}));
 if(local.layoutRotation!==undefined&&path.node.type==='ink')local.layoutRotation-=matrixAngle(path.parentWorld);
 return local;
}
export function applySceneWorldPatch(page,id,values,options={}){
 return applySceneNodePatch(page,id,sceneWorldValues(page,id,values),options);
}

export function applyScenePatchBatch(page,changes,{policy=AI_SCENE_POLICY,confirmation,linked='solve'}={}){
 requireScenePolicy(policy);
 const snapshots=changes.map(({id})=>{const node=findSceneNode(page,id);if(!node)throw Error('图层不存在：'+id);return [node,copy(node)];});
 const restoreLayout=sceneLayoutJournal(page);
 try{
  for(const {id,values} of changes)applySceneNodePatch(page,id,values,{policy,confirmation,deferLayout:true});
  for(const {id,place} of changes)if(place){
   const node=findSceneNode(page,id),binding=linked==='offset'&&node.layoutConstraint?copy(node.layoutConstraint):null;
   applyScenePlacement(page,id,place,{deferSolve:true});if(binding)node.layoutConstraint=binding;
  }
  if(linked==='offset'){
   // Reconcile all edited bindings from final poses, then solve once. The
   // helper's deferred mode prevents one follower from being moved too early.
   for(const {id,values,place} of changes)if(place||['x','y','rotation','points','localTransform'].some(k=>Object.hasOwn(values,k)))reconcileManualSceneMove(page,id,{deferSolve:true});
  }
  solveSceneLayout(page);restoreLayout.validate(policy,changes.map(change=>change.id));return changes.map(({id})=>findSceneNode(page,id));
 }catch(error){restoreLayout();for(const [node,before] of snapshots)replace(node,before);throw error;}
}

export function applyScenePagePatch(page,values,{policy=AI_SCENE_POLICY}={}){
 requireScenePolicy(policy);
 const allowed=new Set(['paperColor','paperPattern','paperColumns','paperRuling','drawCenterGutter']);
 for(const [key,value] of Object.entries(values)){
  if(!allowed.has(key))throw Error('纸张属性不在允许范围：'+key);
  if(key==='paperColor'&&!/^#[0-9a-fA-F]{6}$/.test(value))throw Error('纸色无效');
  if(key==='paperPattern'&&!['plain','lines','grid','dots','columns'].includes(value))throw Error('纸张图案无效');
  if(['paperColumns','drawCenterGutter'].includes(key)&&typeof value!=='boolean')throw Error('纸张选项需为布尔值');
 }
 for(const [key,value] of Object.entries(values))if(value===undefined)delete page[key];else page[key]=copy(value);
 return page;
}

export function insertSceneLayer(page,node,{policy=AI_SCENE_POLICY,parent=null}={}){
 requireScenePolicy(policy);
 const target=parent?assertSceneEditable(page,parent):null;
 if(target)assertPolicyOwnership(target,policy);
 if(target&&target.type!=='group')throw Error('插入目标必须是组合');
 const ids=new Set();
 const check=n=>{
  if(!n?.id||ids.has(n.id)||findSceneNode(page,n.id))throw Error('图层编号重复或无效：'+n?.id);ids.add(n.id);
  if(policy.actor==='ai'&&(n.manualVisualResize||n.manualVisualCopy||n.manualGeometryOverride))throw Error('AI 插入不能携带人工授权标记');
  if(n.type==='text')reflowSceneText(n,n.textLayout?{}:{minimumHeight:n.height||0});
  finiteNode(n);if(n.children)n.children.forEach(check);
 };
 const next=copy(node);check(next);
 const layers=target?.children||page.layers,restoreLayout=sceneLayoutJournal(page);
 layers.push(next);
 try{solveSceneLayout(page);restoreLayout.validate(policy,[next.id]);return next;}catch(error){layers.pop();restoreLayout();throw error;}
}

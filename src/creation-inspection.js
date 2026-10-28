import {worldBox} from './scene-spatial.js';
import {creationNodes} from './creation-scene-core.js';
import {creationSceneRevision} from './creation-transaction.js';
import {creationCommandRegistry,describeCreationCommand,creationHelpTopics} from './creation-v2-contract.js';
import {describeCreationGuidance} from './creation-guidance.js';

// The compact view reports a world-space measurement separately from native
// local fields. An AI never has to reconstruct a group's matrices to place
// its next object: Command's place.reference handles that conversion.
export function inspectCreationDocument(document,{ids=[],full=false}={}){
 const s=document.page.canvas.height/document.page.physicalPageHeightMM,readable=value=>Number(value.toFixed(5));
 const all=creationNodes(document.page.layers),wanted=new Set(ids);
 for(const id of wanted)if(!all.some(n=>[n.id,n.agentKey,n.creativePieceID,n.key].includes(id)))throw Error('图层不存在：'+id);
 const visit=(nodes,parent=null)=>nodes.flatMap(n=>{
  let world=null;
  if(n.type!=='group'||n.layoutBox){const b=worldBox(document.page,n.id);world={centerMm:[b.cx/s,b.cy/s].map(readable),sizeMm:[b.w/s,b.h/s].map(readable),rotationDeg:readable(b.rotation)};}
  const selected=!wanted.size||[n.id,n.agentKey,n.creativePieceID,n.key].some(id=>wanted.has(id));
  const entry=full?{...structuredClone(n),parent,world}:Object.fromEntries(Object.entries({
   id:n.id,alias:n.creativePieceID||n.agentKey||n.key,type:n.type,parent,world,zIndex:n.zIndex??0,
   hidden:Boolean(n.hidden||n.isHidden||n.isParked),locked:Boolean(n.isLocked||n.locked),
   opacity:n.opacity??1,blendMode:n.blendMode||'normal',asset:n.assetID?document.source.materials.find(m=>m.assetID===n.assetID)?.alias||'未授权素材':undefined,
   cropRect:n.cropRect,materialMask:n.materialMask,vectorMask:n.vectorMask,content:n.content,kind:n.kind,color:n.color,fill:n.fill,stroke:n.stroke,lineWidth:n.lineWidth,
   fillOpacity:n.fillOpacity,strokeOpacity:n.strokeOpacity,shapeOptions:n.shapeOptions,
   fontSize:n.fontSize,fontName:n.fontName,style:n.style,
   layoutConstraint:n.layoutConstraint,layoutBox:n.layoutBox,localTransform:n.localTransform,
   points:n.points?.length,paths:n.vectorPaths?.length,children:n.children?.map(child=>child.id)
  }).filter(([,v])=>v!==undefined));
  return [...(selected?[entry]:[]),...(n.type==='group'?visit(n.children,n.id):[])];
 });
 return {sceneRevision:creationSceneRevision(document),coordinateSystem:'world is measured in page millimetres; native fields in full records stay in the parent local frame; use place.reference for edits',
  page:{canvas:document.page.canvas,physicalPageHeightMM:document.page.physicalPageHeightMM,pageMode:document.page.pageMode},layers:visit(document.page.layers)};
}
export function creationHelp({topics=[],full=false}={}){
 if(!topics.length)return {protocolVersion:2,topics:creationHelpTopics,operations:Object.values(creationCommandRegistry).map(({name,available,advanced,summary})=>({name,available,advanced,summary}))};
 return {descriptions:topics.map(name=>describeCreationCommand(name,{full}))};
}
export {describeCreationGuidance};

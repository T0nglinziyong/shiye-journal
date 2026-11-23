import {worldBox} from './scene-spatial.js';
import {creationNodes} from './creation-scene-core.js';
import {creationSceneRevision} from './creation-transaction.js';
import {creationCommandRegistry,describeCreationCommand,creationHelpTopics} from './creation-v2-contract.js';
import {describeCreationGuidance} from './creation-guidance.js';
import {visibleQuad} from './creation-edge-alignment.js';

// The compact view reports a world-space measurement separately from native
// local fields. An AI never has to reconstruct a group's matrices to place
// its next object: Command's place.reference handles that conversion.
export function inspectCreationDocument(document,{ids=[],full=false,edgeQuads={}}={}){
 const s=document.page.canvas.height/document.page.physicalPageHeightMM,readable=value=>Number(value.toFixed(5));
 const all=creationNodes(document.page.layers),wanted=new Set(ids);
 for(const id of wanted)if(!all.some(n=>[n.id,n.agentKey,n.creativePieceID,n.key].includes(id)))throw Error('图层不存在：'+id);
 const visit=(nodes,parent=null,parentSurface='page')=>nodes.flatMap((n,index)=>{
  const surface=parentSurface!=='page'?parentSurface:(n.isParked||n.parked)?n.workspaceId||'tray':'page';
  let world=null;
  if(n.type!=='group'||n.layoutBox){const b=worldBox(document.page,n.id);world={centerMm:[b.cx/s,b.cy/s].map(readable),sizeMm:[b.w/s,b.h/s].map(readable),rotationDeg:readable(b.rotation)};}
  const selected=!wanted.size||[n.id,n.agentKey,n.creativePieceID,n.key].some(id=>wanted.has(id));
  let visibleEdge;
  if(n.type==='material'&&(full||wanted.size)&&selected){
   try{const q=visibleQuad(document.page,n.id,undefined,document.source,edgeQuads);visibleEdge={source:q.source,quad:q.quad};}
   catch{visibleEdge={source:'observedQuadRequired'};}
  }
  const entry=full?{...structuredClone(n),parent,world,visibleEdge}:Object.fromEntries(Object.entries({
   id:n.id,alias:n.creativePieceID||n.agentKey||n.key,type:n.type,parent,world,zIndex:n.zIndex??0,
   stackIndex:index,stackSize:nodes.length,visibleEdge,
   surface,hidden:Boolean(n.hidden||n.isHidden),locked:Boolean(n.isLocked||n.locked),
   opacity:n.opacity??1,blendMode:n.blendMode||'normal',asset:n.assetID?document.source.materials.find(m=>m.assetID===n.assetID)?.alias||'未授权素材':undefined,
   cropRect:n.cropRect,materialMask:n.materialMask,vectorMask:n.vectorMask,content:n.content,kind:n.kind,color:n.color,fill:n.fill,stroke:n.stroke,lineWidth:n.lineWidth,
   paperSurface:n.paperSurface?{kind:n.paperSurface.kind,intensity:n.paperSurface.intensity,seed:n.paperSurface.seed}:n.paperSurface,fillOpacity:n.fillOpacity,strokeOpacity:n.strokeOpacity,shapeOptions:n.shapeOptions,
   fontSizePt:n.type==='text'?readable(n.fontSize/s*72/25.4):undefined,fontName:n.fontName,style:n.style,
   layoutConstraint:n.layoutConstraint,layoutBox:n.layoutBox,localTransform:n.localTransform,
   points:n.points?.length,paths:n.vectorPaths?.length,children:n.children?.map(child=>child.id)
  }).filter(([,v])=>v!==undefined));
  // Return the editable surface options; unitScale is renderer bookkeeping.
  if(n.paperSurface)entry.paperSurface={kind:n.paperSurface.kind,intensity:n.paperSurface.intensity,seed:n.paperSurface.seed};
  return [...(selected?[entry]:[]),...(n.type==='group'?visit(n.children,n.id,surface):[])];
 });
 const layerTree=(nodes)=>nodes.map((n,index)=>({id:n.id,alias:n.creativePieceID||n.agentKey||n.key||n.id,type:n.type,stackIndex:index,
  ...(n.type==='group'?{children:layerTree(n.children||[])}:{})}));
 return {sceneRevision:creationSceneRevision(document),coordinateSystem:'world is measured in page millimetres; compact text fontSizePt is physical points (same as Command style.fontSizePt); full native fontSize is canvas pixels, never copy it as points; native fields in full records stay in the parent local frame; use place.reference for edits',
  stacking:'layerTree and stackIndex are back-to-front within each parent; larger stackIndex covers smaller. layer.update.order changes siblings; group.create, layer.reparent and group.ungroup change group structure.',
  layerTree:layerTree(document.page.layers),page:{canvas:document.page.canvas,physicalPageHeightMM:document.page.physicalPageHeightMM,pageMode:document.page.pageMode},layers:visit(document.page.layers)};
}
export function creationHelp({topics=[],full=false}={}){
 if(!topics.length)return {protocolVersion:2,topics:creationHelpTopics,
  conventions:{id:'新对象编号',target:'已有对象编号',targets:'多个已有对象编号',reference:'位置/角度/层序的参照对象',place:'位置、角度和工作空间',size:'尺寸与尺寸跟随',style:'颜色、线条、字体和透明度',order:'同级前后层序'},
  families:[
   {intent:'取用与新建',commands:['material.add','text.add','text.lettering','graphic.add','group.compose']},
   {intent:'修改与替换',commands:['layer.update','material.replace','text.reflow','text.fit','page.update']},
   {intent:'位置与对齐',commands:['layout.nudge','layout.matchRotation','layout.alignEdge','layout.align','layout.arrange','layout.detach']},
   {intent:'层序与组合',commands:['layer.stack','layer.reparent','group.create','group.ungroup','layer.duplicate','layer.delete','layer.mask']},
   {intent:'实体裁剪与连接',commands:['material.cut','material.tear','material.split','material.window','material.edge','material.contour','material.restore','material.weave','material.relate','material.tape','material.glyphKnockout']},
   {intent:'素材取舍',commands:['material.decision']}
  ],operations:Object.values(creationCommandRegistry).map(({name,available,advanced,summary})=>({name,available,advanced,summary}))};
 return {descriptions:topics.map(name=>describeCreationCommand(name,{full}))};
}
export {describeCreationGuidance};

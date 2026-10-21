import Ajv2020 from 'ajv/dist/2020.js';
import candidateOperations from '../creation-contract/static/api/operations.json' with {type:'json'};
import {applyCommandBatch} from './v3-commands.js';
import {creationV2RuntimeSchema,advancedCreationV2Names,describeAdvancedCreationV2Command} from './creation-v2-contract.js';
import {creationReferenceBox,resolveCreationPlace} from './creation-placement.js';
import {textLines} from './editor-tools-model.js';
import {normalizeGeometry,rectangleGeometry,geometryBounds,geometryArea,geometryIntersection,geometryDifference} from './craft-topology.js';
import {geometryToMask,itemSourceGeometry} from './craft-region-ops.js';
import {creationRegionGeometry} from './creation-region.js';
import {attachSceneV2,groupSceneLayers,moveSceneNode} from './scene-v2.js';
import {applyScenePlacement,assertNoLinkedDependents,detachLinkedDependents,detachSceneLayout,solveSceneLayout} from './scene-layout.js';
import {spatialPath,worldBox} from './scene-spatial.js';
import {compileTwoHoleWeaves} from './craft-display.js';
import {validateWebScene} from './web-scene-workbench.js';
import {assetSourceRevision} from './material-anatomy.js';
import {craftDigest,craftSceneHash} from './craft-fingerprint.js';
import {tapeDimensions} from './tape-strip.js';

const schema=new Ajv2020({strict:false,allErrors:true}).compile(creationV2RuntimeSchema);
export const executableCreationV2Names=Object.freeze(['material.add','text.add','text.update','shape.add','vector.add','ink.add','layer.place','layer.update','layer.reparent','layer.reorder','layer.delete','group.create','group.compose','group.ungroup','layout.detach','material.crop','material.window','material.split','material.mask','material.weave','material.tape','material.edge','material.decision','page.update']);
export function describeCreationV2Command(name){
 const advanced=describeAdvancedCreationV2Command(name);if(advanced)return advanced;
 if(!executableCreationV2Names.includes(name))throw Object.assign(Error('尚未接入的协议 2 操作：'+name),{code:'UNKNOWN_HELP_TOPIC'});
 const operation=candidateOperations.operations.find(row=>row.name===name);
 return {name,protocolVersion:2,available:true,summary:operation.summary,required:operation.schema.required.filter(key=>key!=='op'),schema:operation.schema,examples:operation.examples};
}
const scale=page=>page.canvas.height/page.physicalPageHeightMM;
const allNodes=(nodes,out=[])=>{for(const node of nodes||[]){out.push(node);if(node.type==='group')allNodes(node.children,out);}return out;};
const find=(doc,id)=>allNodes(doc.page.layers).find(node=>[node.id,node.key,node.agentKey,node.creativePieceID].includes(id));
const requireNode=(doc,id)=>{const node=find(doc,id);if(!node)throw Error('图层不存在：'+id);return node;};
function locate(nodes,id,parent=null){for(const node of nodes){if([node.id,node.key,node.agentKey,node.creativePieceID].includes(id))return {node,parent,siblings:nodes};if(node.type==='group'){const found=locate(node.children,id,node);if(found)return found;}}return null;}
const assetFor=(doc,assets,alias)=>{
 const id=doc.source.materials.find(row=>row.alias===alias)?.assetID;
 const asset=assets.find(row=>row.id===id);
 if(!asset)throw Error('素材别名不存在：'+alias);
 return asset;
};
function dimension(page,size,key,parentID=null){
 if(!size||!Number.isFinite(size[key])||size[key]<=0)throw Error('size.'+key+' 必须是正数');
 if(size.unit==='mm')return size[key];
 if(size.unit==='ratio'){
  const box=creationReferenceBox(page,size.reference,parentID);
  return size[key]*(key==='width'?box.w:box.h)/scale(page);
 }
 throw Error('尺寸单位无效：'+size.unit);
}
function dimensions(page,size,{parentID=null,ratio=1,current=null}={}){
 if(!size)return current;
 let width=size.width===undefined?null:dimension(page,size,'width',parentID);
 let height=size.height===undefined?null:dimension(page,size,'height',parentID);
 if(width===null&&height===null)throw Error('size 需要宽或高');
 if(width===null)width=height*ratio;
 if(height===null)height=width/ratio;
 if(!(width>0&&height>0))throw Error('size 宽高无效');
 return {width,height};
}
function styleFor(type,style,page,node=null){
 if(!style)return {};
 const mapping={opacity:'opacity',blendMode:'blendMode',shadow:'shadow'};
 if(type==='text')Object.assign(mapping,{color:'color',fontSizePt:'fontSizePt',fontFamily:'fontName',fontWeight:'bold',textAlign:'alignment',letterSpacingMm:'letterSpacing',lineHeight:'fixedLineHeight'});
 if(type==='shape')Object.assign(mapping,{fill:'fill',stroke:'stroke',strokeWidthMm:'lineWidth'});
 const result={};
 for(const [key,value] of Object.entries(style)){
  if(!mapping[key])throw Error(type+' 不支持 style.'+key);
  result[mapping[key]]=key==='fontWeight'?value==='bold':key==='strokeWidthMm'||key==='letterSpacingMm'?value*scale(page):
   key==='lineHeight'?value*((style.fontSizePt??(Number.isFinite(node?.fontSize)?node.fontSize/scale(page)*72/25.4:12))*25.4/72*scale(page)):
   key==='shadow'?{offsetX:value.offsetMm[0]*scale(page),offsetY:value.offsetMm[1]*scale(page),blur:value.blurMm*scale(page),color:value.color}:value;
 }
 return result;
}
function runLegacy(doc,op,assets){return applyCommandBatch(doc,{protocolVersion:1,transactionId:'compile',baseSceneRevision:'sha256:'+'0'.repeat(64),operations:[op]},assets);}
function placeFor(doc,place,widthMm,heightMm,rotationDeg=0,parentID=null){return resolveCreationPlace(doc.page,place,{widthMm,heightMm,rotationDeg,parentID});}
function addToParent(doc,id,parent){if(parent){const group=requireNode(doc,parent);if(group.type!=='group')throw Error('父级必须是图层组');moveSceneNode(doc.page,requireNode(doc,id).id,{parentID:group.id});}return doc;}
function finishPlacement(doc,id,place){if(place)applyScenePlacement(doc.page,id,place);return doc;}
function groupBox(doc,ids){
 const boxes=ids.map(id=>worldBox(doc.page,id));
 const cx=boxes.reduce((sum,b)=>sum+b.cx,0)/boxes.length,cy=boxes.reduce((sum,b)=>sum+b.cy,0)/boxes.length;
 return {width:Math.max(1,2*Math.max(...boxes.map(b=>Math.abs(b.cx-cx)+b.w/2))),height:Math.max(1,2*Math.max(...boxes.map(b=>Math.abs(b.cy-cy)+b.h/2)))};
}
function patch(doc,target,values,assets){return Object.keys(values).length?runLegacy(doc,{op:'layer.update',target,set:values},assets):doc;}
function measuredTextHeight(node){
 const width=text=>Array.from(text).reduce((n,ch)=>n+node.fontSize*(/[\u0000-\u00ff]/u.test(ch)?.65:1)+(node.letterSpacing||0),0);
 const lines=textLines(node,width);
 return Math.max(node.fontSize*1.3,lines.height,node.fontSize*1.6+Math.abs(node.curveHeight||0));
}
function reorder(doc,target,order,assets){
 const at=locate(doc.page.layers,target);if(!at)throw Error('图层不存在：'+target);
 const peers=at.siblings.filter(node=>node!==at.node);
 let before;
 if(order.before){if(!peers.some(node=>node.id===requireNode(doc,order.before).id))throw Error('排序目标必须是同级图层');before=order.before;}
 else if(order.after){const index=peers.findIndex(node=>node.id===requireNode(doc,order.after).id);if(index<0)throw Error('排序目标必须是同级图层');before=peers[index+1]?.id;}
 else if(order.edge==='back')before=peers[0]?.id;
 return runLegacy(doc,{op:'layer.move',target,parent:at.parent?.id,before},assets);
}
function displayMaskGeometry(node,asset,region,page){
 const s=scale(page),crop=node.cropRect||{x:0,y:0,width:1,height:1};
 const regionGeometry=creationRegionGeometry(region,{sourceSize:[asset.physicalWidthMM,asset.physicalHeightMM],localSize:[node.width/s,node.height/s],crop,output:'localRatio'});
 return geometryIntersection(regionGeometry,rectangleGeometry(0,0,1,1));
}
function cropBoxRatio(node,asset,region,page){
 if(region.shape!=='rect')throw Error('实体 crop 当前仅支持矩形；复杂轮廓请使用高级工艺命令');
 const [x,y,w,h]=region.box,crop=node.cropRect||{x:0,y:0,width:1,height:1};
 const base=region.space==='source'?[asset.physicalWidthMM,asset.physicalHeightMM]:[node.width/scale(page),node.height/scale(page)];
 const unit=region.unit==='mm'?[x/base[0],y/base[1],w/base[0],h/base[1]]:[x,y,w,h];
 const result=region.space==='source'?[(unit[0]-crop.x)/crop.width,(unit[1]-crop.y)/crop.height,unit[2]/crop.width,unit[3]/crop.height]:unit;
 if(result.some(v=>!Number.isFinite(v))||result[0]<-1e-8||result[1]<-1e-8||result[2]<=0||result[3]<=0||result[0]+result[2]>1+1e-8||result[1]+result[3]>1+1e-8)throw Error('裁片区域超出当前实体来源');
 return result.map(v=>Math.max(0,Math.min(1,v)));
}
function splitPhysicalPiece(doc,item,assets,transactionId,index){
 const parent=requireNode(doc,item.target);
 if(parent.type!=='material'||parent.tapeStrip)throw Error('material.split 需要普通实体素材');
 assertNoLinkedDependents(doc.page,parent.id);
 const group=locate(doc.page.layers,item.target)?.parent;
 const asset=assets.find(row=>row.id===parent.assetID);
 if(!asset)throw Error('素材来源不存在');
 const parentCrop=parent.cropRect||{x:0,y:0,width:1,height:1};
 const factor=scale(doc.page),parentWorld=worldBox(doc.page,item.target);
 const angle=parentWorld.rotation*Math.PI/180;
 const pieces=item.pieces.map(part=>{
  if(part.id===item.target||find(doc,part.id))throw Error('新裁片编号已经使用：'+part.id);
  const geometry=creationRegionGeometry(part.region,{sourceSize:[asset.physicalWidthMM,asset.physicalHeightMM],localSize:[parent.width/factor,parent.height/factor],crop:parentCrop});
  if(geometryArea(geometry)<=0)throw Error('分片区域为空：'+part.id);
  const bounds=geometryBounds(geometry),crop={x:bounds.x/asset.physicalWidthMM,y:bounds.y/asset.physicalHeightMM,width:bounds.width/asset.physicalWidthMM,height:bounds.height/asset.physicalHeightMM};
  const u=(crop.x-parentCrop.x)/parentCrop.width,v=(crop.y-parentCrop.y)/parentCrop.height,w=crop.width/parentCrop.width,h=crop.height/parentCrop.height;
  const dx=(u+w/2-.5)*parent.width,dy=(v+h/2-.5)*parent.height;
  const defaultCenter={x:parentWorld.cx+dx*Math.cos(angle)-dy*Math.sin(angle),y:parentWorld.cy+dx*Math.sin(angle)+dy*Math.cos(angle),rotation:parentWorld.rotation};
  const position=part.place?placeFor(doc,part.place,crop.width*asset.physicalWidthMM,crop.height*asset.physicalHeightMM,defaultCenter.rotation):defaultCenter;
  return {id:part.id,asset:doc.source.materials.find(row=>row.assetID===asset.id)?.alias,sourceRevision:assetSourceRevision(asset),unit:parent.materialUnitIndex||0,
   parentId:parent.creativePieceID||parent.id,extraction:part.region.shape==='rect'?{type:'rect_crop',boxMM:[bounds.x,bounds.y,bounds.width,bounds.height]}:{type:'geometry',geometryMM:geometry},
   centerMM:[position.x/factor,position.y/factor],rotationDeg:position.rotation};
 });
 const commandId='v2-'+craftDigest([transactionId,index]).slice(7,31);
 const next=runLegacy(doc,{op:'material.craft',plan:{format:'shiye-craft-plan',version:2,commandId,baseSceneHash:craftSceneHash(doc.page),pieces,
  consume:[parent.creativePieceID||parent.id],keepRemainders:item.keepRemainder!==false}},assets);
 if(group)for(const piece of pieces)moveSceneNode(next.page,requireNode(next,piece.id).id,{parentID:group.id});
 return next;
}
function physicalCut(doc,{target,regions,keepRemainders=true},assets,transactionId,index){
 const parent=requireNode(doc,target);
 if(parent.type!=='material'||parent.tapeStrip)throw Error('实体裁切需要普通素材');
 assertNoLinkedDependents(doc.page,parent.id);
 const group=locate(doc.page.layers,target)?.parent;
 const asset=assets.find(row=>row.id===parent.assetID);if(!asset)throw Error('素材来源不存在');
 const source=itemSourceGeometry(parent,asset),crop=parent.cropRect||{x:0,y:0,width:1,height:1},factor=scale(doc.page),world=worldBox(doc.page,target),
  angle=world.rotation*Math.PI/180,alias=doc.source.materials.find(row=>row.assetID===asset.id)?.alias;
 if(!alias)throw Error('素材别名不存在');
 const pieces=regions.map(({id,geometry,treatments})=>{
  if(find(doc,id)||id===target)throw Error('新裁片编号已经使用：'+id);
  const inside=geometryIntersection(source,geometry);
  if(geometryArea(inside)<=0||Math.abs(geometryArea(inside)-geometryArea(geometry))>1e-5)throw Error('裁片区域超出当前素材');
  const b=geometryBounds(inside),u=(b.x/asset.physicalWidthMM-crop.x)/crop.width,
   v=(b.y/asset.physicalHeightMM-crop.y)/crop.height,w=b.width/(crop.width*asset.physicalWidthMM),h=b.height/(crop.height*asset.physicalHeightMM),
   dx=(u+w/2-.5)*parent.width,dy=(v+h/2-.5)*parent.height;
  return {id,asset:alias,sourceRevision:assetSourceRevision(asset),unit:parent.materialUnitIndex||0,
   parentId:parent.creativePieceID||parent.id,extraction:{type:'geometry',geometryMM:inside},
   centerMM:[(world.cx+dx*Math.cos(angle)-dy*Math.sin(angle))/factor,(world.cy+dx*Math.sin(angle)+dy*Math.cos(angle))/factor],rotationDeg:world.rotation,z:parent.zIndex||10,
   ...(treatments?.length?{treatments}:{})};
 });
 const commandId='v2-'+craftDigest([transactionId,index,'physical-cut']).slice(7,31);
 const next=runLegacy(doc,{op:'material.craft',plan:{format:'shiye-craft-plan',version:2,commandId,
  baseSceneHash:craftSceneHash(doc.page),pieces,consume:[parent.creativePieceID||parent.id],keepRemainders}},assets);
 if(group)for(const piece of pieces)moveSceneNode(next.page,requireNode(next,piece.id).id,{parentID:group.id});
 return next;
}
function tornEdgeStep(node,asset,edge){
 const crop=node.cropRect||{width:1,height:1};
 const side=Math.min(crop.width*asset.physicalWidthMM,crop.height*asset.physicalHeightMM);
 return {op:'edge',style:'torn',edges:['top','right','bottom','left'],
  depth_mm:Math.max(.1,Math.min(side*.08,(edge.roughness??.2)*3)),period_mm:Math.max(.5,side*.16),seed:edge.seed};
}
export function validateCreationV2Commands(input){
 if(schema(input))return input;
 const error=schema.errors[0];
 throw Object.assign(Error('v2 commands'+error.instancePath+' '+error.message),{code:'COMMAND_SCHEMA_INVALID'});
}
export function applyCreationV2Batch(document,input,assets){
 validateCreationV2Commands(input);
 let doc=structuredClone(document);
 for(const [index,item] of input.operations.entries())try{
  const s=scale(doc.page);
  if(advancedCreationV2Names.includes(item.op)){
   doc=runLegacy(doc,{...item,op:item.op.slice('advanced.v1.'.length)},assets);
  }else if(item.op==='material.add'){
   const asset=assetFor(doc,assets,item.asset),position=placeFor(doc,item.place,asset.physicalWidthMM,asset.physicalHeightMM,0,item.parent);
   doc=runLegacy(doc,{op:'material.add',id:item.id,asset:item.asset,placement:{xMm:position.x/s,yMm:position.y/s,rotationDeg:position.rotation}},assets);
   addToParent(doc,item.id,item.parent);finishPlacement(doc,item.id,item.place);
   doc=patch(doc,item.id,styleFor('material',item.style,doc.page),assets);
   if(item.order)doc=reorder(doc,item.id,item.order,assets);
  }else if(item.op==='text.add'){
   const widthMm=dimension(doc.page,item.size,'width',item.parent);
   doc=runLegacy(doc,{op:'text.add',id:item.id,content:item.content,xMm:doc.page.canvas.width/2/s,yMm:doc.page.canvas.height/2/s,widthMm,fontSizePt:item.style?.fontSizePt||12,color:item.style?.color||'#334d4a'},assets);
   const node=requireNode(doc,item.id),position=placeFor(doc,item.place,node.width/s,node.height/s,node.rotation||0,item.parent);
   const style=styleFor('text',item.style,doc.page,node);delete style.fontSizePt;delete style.color;
   doc=patch(doc,item.id,{x:position.x,y:position.y,rotation:position.rotation,...style},assets);
   addToParent(doc,item.id,item.parent);finishPlacement(doc,item.id,item.place);
   if(item.order)doc=reorder(doc,item.id,item.order,assets);
  }else if(item.op==='shape.add'){
   const {width:widthMm,height:heightMm}=dimensions(doc.page,item.size,{parentID:item.parent});
   const position=placeFor(doc,item.place,widthMm,heightMm,0,item.parent);
   doc=runLegacy(doc,{op:'shape.add',id:item.id,kind:item.kind==='rect'?'rectangle':item.kind,xMm:position.x/s,yMm:position.y/s,widthMm,heightMm,fill:item.style?.fill||null},assets);
   const style=styleFor('shape',item.style,doc.page);delete style.fill;
   doc=patch(doc,item.id,{rotation:position.rotation,...style},assets);
   addToParent(doc,item.id,item.parent);finishPlacement(doc,item.id,item.place);
   if(item.order)doc=reorder(doc,item.id,item.order,assets);
  }else if(item.op==='vector.add'){
   const {width:widthMm,height:heightMm}=dimensions(doc.page,item.size,{parentID:item.parent,ratio:item.viewBox[2]/item.viewBox[3]});
   if(!(item.viewBox[2]>0&&item.viewBox[3]>0))throw Error('viewBox 宽高必须是正数');
   const position=placeFor(doc,item.place,widthMm,heightMm,0,item.parent);
   const style=styleFor('shape',item.style,doc.page);
   const paths=item.paths.map(path=>{
    const part={d:path.d};if(path.fillRule)part.fillRule=path.fillRule;
    for(const [key,value] of Object.entries(styleFor('shape',path.style,doc.page)))if(['fill','stroke','opacity'].includes(key))part[key]=value;else throw Error('路径样式尚不支持：'+key);
    return part;
   });
   doc=runLegacy(doc,{op:'layer.insert',node:{id:item.id,type:'shape',kind:'vector',x:position.x,y:position.y,width:widthMm*s,height:heightMm*s,rotation:position.rotation,zIndex:500,fill:style.fill??null,stroke:style.stroke??null,opacity:style.opacity??1,blendMode:style.blendMode??'normal',svgPaths:paths,svgViewBox:item.viewBox}},assets);
   addToParent(doc,item.id,item.parent);finishPlacement(doc,item.id,item.place);
   if(item.order)doc=reorder(doc,item.id,item.order,assets);
  }else if(item.op==='ink.add'){
   const style=item.style;
   if(!style||!Number.isFinite(style.strokeWidthMm)||!style.color)throw Error('笔迹需要 strokeWidthMm 和 color');
   for(const key of Object.keys(style))if(!['strokeWidthMm','color','opacity','blendMode','penStyle','shadow'].includes(key))throw Error('笔迹不支持 style.'+key);
   const xs=item.points.map(p=>p.x),ys=item.points.map(p=>p.y);
   const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
   const widthMm=Math.max(.01,Math.max(...xs)-Math.min(...xs)),heightMm=Math.max(.01,Math.max(...ys)-Math.min(...ys));
   const position=placeFor(doc,item.place,widthMm,heightMm,0,item.parent);
   const a=position.rotation*Math.PI/180,c=Math.cos(a),sin=Math.sin(a);
   const points=item.points.map(p=>({xMm:position.x/s+(p.x-cx)*c-(p.y-cy)*sin,yMm:position.y/s+(p.x-cx)*sin+(p.y-cy)*c,...(p.pressure===undefined?{}:{pressure:p.pressure})}));
   const pen=style.penStyle==='pen'?'ballpoint':style.penStyle||'ballpoint';
   doc=runLegacy(doc,{op:'ink.add',id:item.id,points,widthMm:style.strokeWidthMm,color:style.color,penStyle:pen},assets);
   addToParent(doc,item.id,item.parent);
   finishPlacement(doc,item.id,item.place);
   doc=patch(doc,item.id,{...(style.opacity===undefined?{}:{opacity:style.opacity}),...(style.blendMode===undefined?{}:{blendMode:style.blendMode}),...(style.shadow?{shadow:styleFor('ink',{shadow:style.shadow},doc.page).shadow}:{})},assets);
   if(item.order)doc=reorder(doc,item.id,item.order,assets);
  }else if(item.op==='text.update'){
   const node=requireNode(doc,item.target);if(node.type!=='text')throw Error('text.update 只接受文字图层');
   const values={...styleFor('text',item.style,doc.page,node)};
   if(item.content!==undefined)values.content=item.content;
   const parentID=locate(doc.page.layers,item.target)?.parent?.id;
   if(item.size?.width!==undefined)values.widthMm=dimension(doc.page,item.size,'width',parentID);
   doc=patch(doc,item.target,values,assets);
   const resized=requireNode(doc,item.target);
   const minimum=measuredTextHeight(resized);
   const requested=item.size?.height===undefined?0:dimension(doc.page,item.size,'height',parentID)*s;
   doc=patch(doc,item.target,{height:Math.max(minimum,requested)},assets);
   if(item.place)finishPlacement(doc,item.target,item.place);
   if(item.order)doc=reorder(doc,item.target,item.order,assets);
  }else if(item.op==='layer.place'){
   requireNode(doc,item.target);
   finishPlacement(doc,item.target,item.place);
  }else if(item.op==='layer.update'){
   const node=requireNode(doc,item.target);
   if(node.type==='ink'&&item.size)throw Error('笔迹宽度是实体笔画宽度，请用明确笔画命令修改');
   if(node.type==='group'&&item.size)throw Error('组合尺寸请使用稳定 layoutBox');
   if(node.type==='material'&&item.size)throw Error('实体素材不能通过 size 改变物理尺寸');
   const values=styleFor(node.type,item.style,doc.page,node);
   if(item.size){
    const parentID=locate(doc.page.layers,item.target)?.parent?.id;
    const measured=dimensions(doc.page,item.size,{parentID,ratio:(node.width||1)/(node.height||1)});
    if(node.type==='text'&&item.size.height===undefined)values.width=measured.width*s;
    else {values.width=measured.width*s;values.height=measured.height*s;}
   }
   doc=patch(doc,item.target,values,assets);
   if(item.place)finishPlacement(doc,item.target,item.place);
   if(item.order)doc=reorder(doc,item.target,item.order,assets);
  }else if(item.op==='layer.reparent'){
   requireNode(doc,item.target);
   if(item.parent!==null){const parent=requireNode(doc,item.parent);if(parent.type!=='group')throw Error('目标父级必须是组');}
   doc=runLegacy(doc,{op:'layer.move',target:item.target,...(item.parent===null?{}:{parent:item.parent})},assets);
   if(item.order)doc=reorder(doc,item.target,item.order,assets);
   solveSceneLayout(doc.page);
  }else if(item.op==='layer.reorder')doc=reorder(doc,item.target,item.order,assets);
  else if(item.op==='layer.delete'){
   const node=requireNode(doc,item.target);
   if(node.type==='group'&&item.cascade===false)throw Error('当前组删除只能连同子图层删除');
   if(item.dependentLinks==='detach')detachLinkedDependents(doc.page,node.id);
   doc=runLegacy(doc,{op:'layer.delete',target:item.target},assets);
  }else if(item.op==='group.create'){
   const targets=item.targets.map(id=>requireNode(doc,id).id);
   const bounds=item.layoutBox?{width:item.layoutBox.width*s,height:item.layoutBox.height*s}:groupBox(doc,targets);
   groupSceneLayers(doc.page,targets,{id:item.id,name:item.id,spatial:true,layoutBox:bounds});
   if(item.style)Object.assign(requireNode(doc,item.id),styleFor('group',item.style,doc.page));
   finishPlacement(doc,item.id,item.place);
   if(item.order)doc=reorder(doc,item.id,item.order,assets);
   validateWebScene(doc.page,doc.source,assets,{final:false});
  }else if(item.op==='group.compose'){
   if(find(doc,item.id))throw Error('组合编号已经存在');
   const group={id:item.id,type:'group',name:item.id,children:[],localTransform:[1,0,0,1,0,0],
    layoutBox:item.layoutBox?{width:item.layoutBox.width*s,height:item.layoutBox.height*s}:
     item.parent&&requireNode(doc,item.parent).layoutBox?{...requireNode(doc,item.parent).layoutBox}:
     {width:doc.page.canvas.width,height:doc.page.canvas.height},opacity:1,blendMode:'normal',zIndex:500};
   if(item.parent){const parent=requireNode(doc,item.parent);if(parent.type!=='group')throw Error('父级必须是图层组');parent.children.push(group);}
   else doc.page.layers.push(group);
   if(item.style)Object.assign(group,styleFor('group',item.style,doc.page));
   finishPlacement(doc,item.id,item.place);
   for(const child of item.children){
    if(child.parent&&child.parent!==item.id)throw Error('组合子操作不能指向其他父级');
    doc=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:input.transactionId+'-child-'+index,baseSceneRevision:input.baseSceneRevision,operations:[{...child,parent:item.id}]},assets);
   }
   if(item.order)doc=reorder(doc,item.id,item.order,assets);
  }else if(item.op==='group.ungroup'){
   if(item.dependentLinks==='detach')detachLinkedDependents(doc.page,requireNode(doc,item.target).id);
   doc=runLegacy(doc,{op:'group.ungroup',target:item.target},assets);
  }
  else if(item.op==='layout.detach')detachSceneLayout(doc.page,item.target);
  else if(item.op==='material.crop'){
   const node=requireNode(doc,item.target);if(node.type!=='material'||node.tapeStrip)throw Error('material.crop 需要普通实体素材');
   const asset=assets.find(row=>row.id===node.assetID),crop=node.cropRect||{x:0,y:0,width:1,height:1};
   const geometry=creationRegionGeometry(item.region,{sourceSize:[asset.physicalWidthMM,asset.physicalHeightMM],localSize:[node.width/s,node.height/s],crop});
   if(item.keepRemainder||item.resultId&&item.resultId!==item.target){
    const id=item.resultId&&item.resultId!==item.target?item.resultId:item.target+'-crop-'+craftDigest([input.transactionId,index]).slice(7,15);
    doc=physicalCut(doc,{target:item.target,regions:[{id,geometry}],keepRemainders:item.keepRemainder!==false},assets,input.transactionId,index);
    if(item.edge?.style==='torn'){
     const cut=requireNode(doc,id);doc=runLegacy(doc,{op:'material.process',target:id,mode:'append',steps:[tornEdgeStep(cut,asset,item.edge)]},assets);
    }
   }else{
    const steps=item.region.shape==='rect'?[{op:'crop',box:{unit:'ratio',mode:'keep',values:cropBoxRatio(node,asset,item.region,doc.page)}}]:
     [{op:'cut_shape',shape:'geometry',mode:'keep',unit:'ratio',geometry:displayMaskGeometry(node,asset,item.region,doc.page)}];
    if(item.edge?.style==='torn')steps.push(tornEdgeStep(node,asset,item.edge));
    doc=runLegacy(doc,{op:'material.process',target:item.target,mode:'append',steps},assets);
   }
  }
  else if(item.op==='material.split')doc=splitPhysicalPiece(doc,item,assets,input.transactionId,index);
  else if(item.op==='material.tape'){
   const asset=assetFor(doc,assets,item.asset);
   if(asset.kind!=='tape')throw Error('material.tape 需要胶带素材');
   const widthMm=tapeDimensions(asset).widthMM,position=placeFor(doc,item.place,item.lengthMm,widthMm,0,item.parent);
   const angle=position.rotation*Math.PI/180,half=item.lengthMm/2,dx=Math.cos(angle)*half,dy=Math.sin(angle)*half;
   doc=runLegacy(doc,{op:'material.tape',arguments:{items:[{asset:item.asset,piece:item.id,coordinate_unit:'mm',points:[[(position.x-dx*s)/s,(position.y-dy*s)/s],[(position.x+dx*s)/s,(position.y+dy*s)/s]]}]}},assets);
   doc=patch(doc,item.id,styleFor('material',item.style,doc.page),assets);
   addToParent(doc,item.id,item.parent);finishPlacement(doc,item.id,item.place);
   if(item.order)doc=reorder(doc,item.id,item.order,assets);
  }
  else if(item.op==='material.edge'){
   const node=requireNode(doc,item.target);
   if(node.type!=='material'||node.tapeStrip)throw Error('material.edge 需要普通实体素材');
   if(item.edge.style==='clean'){
    const steps=(node.materialSteps||[]).filter(step=>step.op!=='edge');
    if(steps.length!==(node.materialSteps||[]).length)
     doc=runLegacy(doc,{op:'material.process',target:item.target,mode:'replace',steps:steps.length?steps:[{op:'whole'}]},assets);
    continue;
   }
   const asset=assets.find(row=>row.id===node.assetID);
   if(!asset)throw Error('素材来源不存在');
   const crop=node.cropRect||{width:1,height:1};
   const side=Math.min(crop.width*asset.physicalWidthMM,crop.height*asset.physicalHeightMM);
   const depth=Math.max(.1,Math.min(side*.08,(item.edge.roughness??.2)*3));
   doc=runLegacy(doc,{op:'material.process',target:item.target,mode:'append',steps:[{op:'edge',style:'torn',edges:['top','right','bottom','left'],depth_mm:depth,period_mm:Math.max(.5,side*.16),seed:item.edge.seed}]},assets);
  }
  else if(item.op==='material.mask'){
   const node=requireNode(doc,item.target);if(node.type!=='material')throw Error('material.mask 只接受实体素材图层');
   const asset=assets.find(row=>row.id===node.assetID);if(!asset)throw Error('素材来源不存在');
   const region=displayMaskGeometry(node,asset,item.region,doc.page),full=rectangleGeometry(0,0,1,1);
   const existing=node.vectorMask?normalizeGeometry([[node.vectorMask.outer,...(node.vectorMask.holes||[])] ]):full;
   const next=item.mode==='subtract'?geometryDifference(existing,region):item.mode==='intersect'?geometryIntersection(existing,region):region;
   const {outer,holes}=geometryToMask(next,1,1);
   doc=patch(doc,item.target,{vectorMask:{outer,holes}},assets);
  }
  else if(item.op==='material.window'){
   const node=requireNode(doc,item.target);if(node.type!=='material'||node.tapeStrip)throw Error('material.window 需要普通实体素材');
   if(node.craftWindowIDs?.includes(item.windowId))throw Error('实体开窗编号重复');
   const asset=assets.find(row=>row.id===node.assetID),crop=node.cropRect||{x:0,y:0,width:1,height:1},
    opening=creationRegionGeometry(item.region,{sourceSize:[asset.physicalWidthMM,asset.physicalHeightMM],localSize:[node.width/s,node.height/s],crop});
   if(item.keepRemainder||item.cutoutId||item.resultId&&item.resultId!==item.target){
    const source=itemSourceGeometry(node,asset),main=geometryDifference(source,opening),cutout=geometryIntersection(source,opening);
    const resultId=item.resultId&&item.resultId!==item.target?item.resultId:item.target+'-window-'+craftDigest([input.transactionId,index]).slice(7,15);
    const pieces=[{id:resultId,geometry:main}];
    if(item.keepRemainder||item.cutoutId)pieces.push({id:item.cutoutId||item.windowId+'-cutout',geometry:cutout});
    doc=physicalCut(doc,{target:item.target,regions:pieces,keepRemainders:item.keepRemainder!==false},assets,input.transactionId,index);
    const mainNode=requireNode(doc,resultId);mainNode.craftWindowIDs=[...(node.craftWindowIDs||[]),item.windowId];
    if(item.edge?.style==='torn')doc=runLegacy(doc,{op:'material.process',target:resultId,mode:'append',steps:[tornEdgeStep(mainNode,asset,item.edge)]},assets);
    validateWebScene(doc.page,doc.source,assets,{final:false});
    continue;
   }
   const before=node.materialMask?.holes?.length||0;
   if(before!==(node.craftWindowIDs?.length||0))throw Error('既有孔洞缺少稳定编号，不能追加命名开窗');
   const previousIDs=[...(node.craftWindowIDs||[])];delete node.craftWindowIDs;
   const steps=[{op:'cut_shape',shape:'geometry',mode:'remove',unit:'ratio',geometry:displayMaskGeometry(node,asset,item.region,doc.page)}];
   if(item.edge?.style==='torn')steps.push(tornEdgeStep(node,asset,item.edge));
   doc=runLegacy(doc,{op:'material.process',target:item.target,mode:'append',steps},assets);
   const updated=requireNode(doc,item.target),after=updated.materialMask?.holes?.length||0;
   if(after!==before+1)throw Error('实体开窗未产生独立孔洞');
   updated.craftWindowIDs=[...previousIDs,item.windowId];
   validateWebScene(doc.page,doc.source,assets,{final:false});
  }
  else if(item.op==='material.weave'){
   const strip=requireNode(doc,item.strip);if(strip.type!=='material')throw Error('穿插纸条必须是实体素材');
   const through=item.through.map(entry=>{
    const target=requireNode(doc,entry.target);if(target.type!=='material')throw Error('穿插目标必须是实体素材');
    const hole=target.craftWindowIDs?.indexOf(entry.window)??-1;
    if(hole<0)throw Error('穿插引用的开窗不存在：'+entry.window);
    return {target:target.creativePieceID||target.id,hole,sideAfter:entry.sideAfter};
   });
   attachSceneV2(doc.page);compileTwoHoleWeaves(doc.page,[{piece:item.strip,through}]);
   validateWebScene(doc.page,doc.source,assets,{final:false});
  }
  else if(item.op==='page.update'){
   if(item.physicalSizeMm||item.mode)throw Error('任务纸张和页面模式不能在作品命令中修改');
   if(!item.paperColor)throw Error('page.update 没有可执行的修改');
   doc=runLegacy(doc,{op:'page.update',paperColor:item.paperColor},assets);
  }else if(item.op==='material.decision')doc=runLegacy(doc,item,assets);
  else throw Error('操作尚未接入 Scene：'+item.op);
  solveSceneLayout(doc.page);
 }catch(error){throw Object.assign(Error('operations['+index+'] '+item.op+': '+error.message),{code:error.code||'OPERATION_FAILED',operationIndex:index});}
 return doc;
}

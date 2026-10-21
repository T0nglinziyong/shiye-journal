import Ajv2020 from 'ajv/dist/2020.js';
import candidateOperations from '../creation-contract/static/api/operations.json' with {type:'json'};
import {applyCommandBatch} from './v3-commands.js';
import {creationV2RuntimeSchema,advancedCreationV2Names,describeAdvancedCreationV2Command} from './creation-v2-contract.js';
import {resolveCreationPlace} from './creation-placement.js';
import {textLines} from './editor-tools-model.js';
import {normalizeGeometry,rectangleGeometry,geometryIntersection,geometryDifference} from './craft-topology.js';
import {geometryToMask} from './craft-region-ops.js';
import {attachSceneV2,groupSceneLayers,moveSceneNode} from './scene-v2.js';
import {applyScenePlacement,detachSceneLayout,solveSceneLayout} from './scene-layout.js';
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
function dimension(page,size,key){
 if(!size||!Number.isFinite(size[key])||size[key]<=0)throw Error('size.'+key+' 必须是正数');
 if(size.unit==='mm')return size[key];
 if(size.unit==='ratio'){
  const reference=size.reference;
  if(reference==='page')return size[key]*(key==='width'?page.canvas.width:page.canvas.height)/scale(page);
  if(reference==='page.left'||reference==='page.right'){
   if(page.pageMode!=='spread')throw Error('单页不能引用左右页');
   return size[key]*(key==='width'?page.canvas.width/2:page.canvas.height)/scale(page);
  }
 }
 throw Error('当前尺寸参照尚不支持：'+size.reference);
}
function styleFor(type,style,page){
 if(!style)return {};
 const mapping={opacity:'opacity',blendMode:'blendMode'};
 if(type==='text')Object.assign(mapping,{color:'color',fontSizePt:'fontSizePt',fontFamily:'fontName',fontWeight:'bold',textAlign:'alignment',letterSpacingMm:'letterSpacing'});
 if(type==='shape')Object.assign(mapping,{fill:'fill',stroke:'stroke',strokeWidthMm:'lineWidth'});
 const result={};
 for(const [key,value] of Object.entries(style)){
  if(!mapping[key])throw Error(type+' 不支持 style.'+key);
  result[mapping[key]]=key==='fontWeight'?value==='bold':key==='strokeWidthMm'||key==='letterSpacingMm'?value*scale(page):value;
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
 if(region.shape==='path')throw Error('路径蒙版尚未接入安全路径解析器');
 const s=scale(page),crop=node.cropRect||{x:0,y:0,width:1,height:1};
 const physical=[asset.physicalWidthMM,asset.physicalHeightMM];
 const local=[node.width/s,node.height/s];
 const point=([x,y])=>{
  if(region.unit==='mm')return region.space==='source'?[(x/physical[0]-crop.x)/crop.width,(y/physical[1]-crop.y)/crop.height]:[x/local[0],y/local[1]];
  return region.space==='source'?[(x-crop.x)/crop.width,(y-crop.y)/crop.height]:[x,y];
 };
 let ring;
 if(region.shape==='polygon')ring=region.points.map(point);
 else {
  const [x,y,w,h]=region.box;if(!(w>0&&h>0))throw Error('蒙版区域宽高无效');
  ring=region.shape==='ellipse'?Array.from({length:64},(_,i)=>[x+w/2+w/2*Math.cos(i*2*Math.PI/64),y+h/2+h/2*Math.sin(i*2*Math.PI/64)]).map(point):[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(point);
 }
 const regionGeometry=normalizeGeometry([[ring]]);
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
 if(locate(doc.page.layers,item.target)?.parent)throw Error('组内实体分片需要父级局部坐标和层序保留，当前尚未接入');
 const asset=assets.find(row=>row.id===parent.assetID);
 if(!asset)throw Error('素材来源不存在');
 const parentCrop=parent.cropRect||{x:0,y:0,width:1,height:1};
 const factor=scale(doc.page),angle=(parent.rotation||0)*Math.PI/180;
 const pieces=item.pieces.map(part=>{
  if(part.id===item.target||find(doc,part.id))throw Error('新裁片编号已经使用：'+part.id);
  const [u,v,w,h]=cropBoxRatio(parent,asset,part.region,doc.page);
  const crop={x:parentCrop.x+u*parentCrop.width,y:parentCrop.y+v*parentCrop.height,width:w*parentCrop.width,height:h*parentCrop.height};
  const dx=(u+w/2-.5)*parent.width,dy=(v+h/2-.5)*parent.height;
  const defaultCenter={x:parent.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:parent.y+dx*Math.sin(angle)+dy*Math.cos(angle),rotation:parent.rotation||0};
  const position=part.place?placeFor(doc,part.place,crop.width*asset.physicalWidthMM,crop.height*asset.physicalHeightMM,defaultCenter.rotation):defaultCenter;
  return {id:part.id,asset:doc.source.materials.find(row=>row.assetID===asset.id)?.alias,sourceRevision:assetSourceRevision(asset),unit:parent.materialUnitIndex||0,
   parentId:parent.creativePieceID||parent.id,extraction:{type:'rect_crop',boxMM:[crop.x*asset.physicalWidthMM,crop.y*asset.physicalHeightMM,crop.width*asset.physicalWidthMM,crop.height*asset.physicalHeightMM]},
   centerMM:[position.x/factor,position.y/factor],rotationDeg:position.rotation};
 });
 const commandId='v2-'+craftDigest([transactionId,index]).slice(7,31);
 return runLegacy(doc,{op:'material.craft',plan:{format:'shiye-craft-plan',version:2,commandId,baseSceneHash:craftSceneHash(doc.page),pieces,
  consume:[parent.creativePieceID||parent.id],keepRemainders:item.keepRemainder!==false}},assets);
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
   if(item.order)throw Error('新增图层的指定层序尚未接入');
   const asset=assetFor(doc,assets,item.asset),position=placeFor(doc,item.place,asset.physicalWidthMM,asset.physicalHeightMM,0,item.parent);
   doc=runLegacy(doc,{op:'material.add',id:item.id,asset:item.asset,placement:{xMm:position.x/s,yMm:position.y/s,rotationDeg:position.rotation}},assets);
   addToParent(doc,item.id,item.parent);finishPlacement(doc,item.id,item.place);
   doc=patch(doc,item.id,styleFor('material',item.style,doc.page),assets);
  }else if(item.op==='text.add'){
   if(item.order)throw Error('新增图层的指定层序尚未接入');
   const widthMm=dimension(doc.page,item.size,'width');
   doc=runLegacy(doc,{op:'text.add',id:item.id,content:item.content,xMm:doc.page.canvas.width/2/s,yMm:doc.page.canvas.height/2/s,widthMm,fontSizePt:item.style?.fontSizePt||12,color:item.style?.color||'#334d4a'},assets);
   const node=requireNode(doc,item.id),position=placeFor(doc,item.place,node.width/s,node.height/s,node.rotation||0,item.parent);
   const style=styleFor('text',item.style,doc.page);delete style.fontSizePt;delete style.color;
   doc=patch(doc,item.id,{x:position.x,y:position.y,rotation:position.rotation,...style},assets);
   addToParent(doc,item.id,item.parent);finishPlacement(doc,item.id,item.place);
  }else if(item.op==='shape.add'){
   if(item.order)throw Error('新增图层的指定层序尚未接入');
   const widthMm=dimension(doc.page,item.size,'width'),heightMm=dimension(doc.page,item.size,'height');
   const position=placeFor(doc,item.place,widthMm,heightMm,0,item.parent);
   doc=runLegacy(doc,{op:'shape.add',id:item.id,kind:item.kind==='rect'?'rectangle':item.kind,xMm:position.x/s,yMm:position.y/s,widthMm,heightMm,fill:item.style?.fill||null},assets);
   const style=styleFor('shape',item.style,doc.page);delete style.fill;
   doc=patch(doc,item.id,{rotation:position.rotation,...style},assets);
   addToParent(doc,item.id,item.parent);finishPlacement(doc,item.id,item.place);
  }else if(item.op==='vector.add'){
   if(item.order)throw Error('新增图层的指定层序尚未接入');
   const widthMm=dimension(doc.page,item.size,'width'),heightMm=dimension(doc.page,item.size,'height');
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
  }else if(item.op==='ink.add'){
   if(item.order)throw Error('新增图层的指定层序尚未接入');
   const style=item.style;
   if(!style||!Number.isFinite(style.strokeWidthMm)||!style.color)throw Error('笔迹需要 strokeWidthMm 和 color');
   for(const key of Object.keys(style))if(!['strokeWidthMm','color','opacity','blendMode','penStyle'].includes(key))throw Error('笔迹不支持 style.'+key);
   const xs=item.points.map(p=>p.x),ys=item.points.map(p=>p.y);
   const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
   const widthMm=Math.max(.01,Math.max(...xs)-Math.min(...xs)),heightMm=Math.max(.01,Math.max(...ys)-Math.min(...ys));
   const position=placeFor(doc,item.place,widthMm,heightMm,0,item.parent);
   const a=position.rotation*Math.PI/180,c=Math.cos(a),sin=Math.sin(a);
   const points=item.points.map(p=>({xMm:position.x/s+(p.x-cx)*c-(p.y-cy)*sin,yMm:position.y/s+(p.x-cx)*sin+(p.y-cy)*c,...(p.pressure===undefined?{}:{pressure:p.pressure})}));
   const pen=style.penStyle==='pen'?'ballpoint':style.penStyle||'ballpoint';
   doc=runLegacy(doc,{op:'ink.add',id:item.id,points,widthMm:style.strokeWidthMm,color:style.color,penStyle:pen},assets);
   addToParent(doc,item.id,item.parent);
   if(item.place.behavior==='linked')throw Error('笔迹尚不支持 linked 定位');
   doc=patch(doc,item.id,{...(style.opacity===undefined?{}:{opacity:style.opacity}),...(style.blendMode===undefined?{}:{blendMode:style.blendMode})},assets);
  }else if(item.op==='text.update'){
   const node=requireNode(doc,item.target);if(node.type!=='text')throw Error('text.update 只接受文字图层');
   if(item.order)throw Error('层序更新尚需局部坐标引擎');
   const values={...styleFor('text',item.style,doc.page)};
   if(item.content!==undefined)values.content=item.content;
   if(item.size){values.widthMm=dimension(doc.page,item.size,'width');}
   doc=patch(doc,item.target,values,assets);
   const resized=requireNode(doc,item.target);
   const minimum=measuredTextHeight(resized);
   const requested=item.size?.height===undefined?0:dimension(doc.page,item.size,'height')*s;
   doc=patch(doc,item.target,{height:Math.max(minimum,requested)},assets);
   if(item.place)finishPlacement(doc,item.target,item.place);
  }else if(item.op==='layer.place'){
   const node=requireNode(doc,item.target);
   if(node.type==='ink')throw Error('笔迹定位需要笔画路径变换');
   finishPlacement(doc,item.target,item.place);
  }else if(item.op==='layer.update'){
   const node=requireNode(doc,item.target);
   if(node.type==='ink'&&(item.place||item.size))throw Error('笔迹定位和尺寸需要笔画路径变换');
   if(node.type==='group'&&item.size)throw Error('组合尺寸请使用稳定 layoutBox');
   if(node.type==='material'&&item.size)throw Error('实体素材不能通过 size 改变物理尺寸');
   const values=styleFor(node.type,item.style,doc.page);
   if(item.size){values.width=dimension(doc.page,item.size,'width')*s;if(item.size.height!==undefined)values.height=dimension(doc.page,item.size,'height')*s;}
   doc=patch(doc,item.target,values,assets);
   if(item.place)finishPlacement(doc,item.target,item.place);
   if(item.order)doc=reorder(doc,item.target,item.order,assets);
  }else if(item.op==='layer.reparent'){
   if(item.order)throw Error('重父级后的指定层序尚未接入');
   requireNode(doc,item.target);const parent=requireNode(doc,item.parent);if(parent.type!=='group')throw Error('目标父级必须是组');
   doc=runLegacy(doc,{op:'layer.move',target:item.target,parent:item.parent},assets);
   solveSceneLayout(doc.page);
  }else if(item.op==='layer.reorder')doc=reorder(doc,item.target,item.order,assets);
  else if(item.op==='layer.delete'){
   const node=requireNode(doc,item.target);
   if(node.type==='group'&&item.cascade===false)throw Error('当前组删除只能连同子图层删除');
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
   if(!item.layoutBox)throw Error('group.compose 需要稳定 layoutBox');
   const group={id:item.id,type:'group',name:item.id,children:[],localTransform:[1,0,0,1,0,0],layoutBox:{width:item.layoutBox.width*s,height:item.layoutBox.height*s},opacity:1,blendMode:'normal',zIndex:500};
   if(item.parent){const parent=requireNode(doc,item.parent);if(parent.type!=='group')throw Error('父级必须是图层组');parent.children.push(group);}
   else doc.page.layers.push(group);
   if(item.style)Object.assign(group,styleFor('group',item.style,doc.page));
   finishPlacement(doc,item.id,item.place);
   for(const child of item.children){
    if(child.parent&&child.parent!==item.id)throw Error('组合子操作不能指向其他父级');
    doc=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:input.transactionId+'-child-'+index,baseSceneRevision:input.baseSceneRevision,operations:[{...child,parent:item.id}]},assets);
   }
   if(item.order)doc=reorder(doc,item.id,item.order,assets);
  }else if(item.op==='group.ungroup')doc=runLegacy(doc,{op:'group.ungroup',target:item.target},assets);
  else if(item.op==='layout.detach')detachSceneLayout(doc.page,item.target);
  else if(item.op==='material.crop'){
   const node=requireNode(doc,item.target);if(node.type!=='material'||node.tapeStrip)throw Error('material.crop 需要普通实体素材');
   if(item.keepRemainder||item.resultId&&item.resultId!==item.target)throw Error('保留余料或新片编号需要实体分片命令');
   if(item.edge?.style==='torn')throw Error('撕边请使用高级工艺命令');
   const asset=assets.find(row=>row.id===node.assetID),box=cropBoxRatio(node,asset,item.region,doc.page);
   doc=runLegacy(doc,{op:'material.process',target:item.target,mode:'append',steps:[{op:'crop',box:{unit:'ratio',mode:'keep',values:box}}]},assets);
  }
  else if(item.op==='material.split')doc=splitPhysicalPiece(doc,item,assets,input.transactionId,index);
  else if(item.op==='material.tape'){
   if(item.parent||item.order)throw Error('胶带组父级和指定层序尚需局部坐标引擎');
   const asset=assetFor(doc,assets,item.asset);
   if(asset.kind!=='tape')throw Error('material.tape 需要胶带素材');
   const widthMm=tapeDimensions(asset).widthMM,position=placeFor(doc,item.place,item.lengthMm,widthMm);
   const angle=position.rotation*Math.PI/180,half=item.lengthMm/2,dx=Math.cos(angle)*half,dy=Math.sin(angle)*half;
   doc=runLegacy(doc,{op:'material.tape',arguments:{items:[{asset:item.asset,piece:item.id,coordinate_unit:'mm',points:[[(position.x-dx*s)/s,(position.y-dy*s)/s],[(position.x+dx*s)/s,(position.y+dy*s)/s]]}]}},assets);
   doc=patch(doc,item.id,styleFor('material',item.style,doc.page),assets);
  }
  else if(item.op==='material.edge'){
   const node=requireNode(doc,item.target);
   if(node.type!=='material'||node.tapeStrip)throw Error('material.edge 需要普通实体素材');
   if(item.edge.style!=='torn')throw Error('清除既有边缘需要重放实体工序，当前仅支持新增撕边');
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
   if(item.keepRemainder||item.cutoutId||item.resultId&&item.resultId!==item.target)throw Error('保留窗芯或新片编号需要实体分片命令');
   if(item.edge?.style==='torn')throw Error('撕边请使用高级工艺命令');
   if(!['rect','ellipse'].includes(item.region.shape))throw Error('当前实体开窗只支持矩形和椭圆');
   if(node.craftWindowIDs?.includes(item.windowId))throw Error('实体开窗编号重复');
   const asset=assets.find(row=>row.id===node.assetID),box=cropBoxRatio(node,asset,{...item.region,shape:'rect'},doc.page);
   const before=node.materialMask?.holes?.length||0;
   if(before!==(node.craftWindowIDs?.length||0))throw Error('既有孔洞缺少稳定编号，不能追加命名开窗');
   const previousIDs=[...(node.craftWindowIDs||[])];delete node.craftWindowIDs;
   doc=runLegacy(doc,{op:'material.process',target:item.target,mode:'append',steps:[{op:'window',shape:item.region.shape==='rect'?'rectangle':'ellipse',box}]},assets);
   const updated=requireNode(doc,item.target),after=updated.materialMask?.holes?.length||0;
   if(after!==before+1)throw Error('实体开窗未产生独立孔洞');
   updated.craftWindowIDs=[...previousIDs,item.windowId];
   validateWebScene(doc.page,doc.source,assets,{final:false});
  }
  else if(item.op==='material.weave'){
   if(item.through.length!==2||item.through[0].target!==item.through[1].target)throw Error('当前穿插需要同一实体上的两个开窗');
   const strip=requireNode(doc,item.strip),target=requireNode(doc,item.through[0].target);
   if(strip.type!=='material'||target.type!=='material')throw Error('穿插需要两个实体素材');
   const ids=target.craftWindowIDs||[],holes=item.through.map(entry=>ids.indexOf(entry.window));
   if(holes.some(index=>index<0)||holes[0]===holes[1])throw Error('穿插引用的开窗不存在或重复');
   const sides=item.through.map(entry=>entry.sideAfter);
   const front=sides[0]==='front'&&sides[1]==='back'?'between':sides[0]==='back'&&sides[1]==='front'?'outside':null;
   if(!front)throw Error('两孔穿插需要交替的正反关系');
   attachSceneV2(doc.page);compileTwoHoleWeaves(doc.page,[{piece:item.strip,target:item.through[0].target,holes,front}]);
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

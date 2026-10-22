import {assertPolicyOwnership} from './scene-edit-policy.js';
import {initialGraphicNode} from './graphic-geometry.js';
import {addLettering} from './creation-design-tools.js';
import {applyScenePagePatch} from './scene-edit-kernel.js';
import {AI_SCENE_POLICY} from './scene-edit-policy.js';
import Ajv2020 from 'ajv/dist/2020.js';
import {creationV2RuntimeSchema,creationCommandRegistry,describeCreationCommand,selfContainedCreationSchema} from './creation-v2-contract.js';
import {arrangeCreationNodes} from './creation-arrange.js';
import {creationReferenceBox,resolveCreationPlace,creationRotationFrame} from './creation-placement.js';
import {normalizeGeometry,rectangleGeometry,geometryBounds,geometryArea,geometryIntersection,geometryDifference,transformGeometry} from './craft-topology.js';
import {geometryToMask,itemSourceGeometry} from './craft-region-ops.js';
import {creationRegionGeometry} from './creation-region.js';
import {attachSceneV2,assertSceneEditable,groupSceneLayers,moveSceneNode} from './scene-v2.js';
import {applyScenePlacement,assertNoLinkedDependents,detachLinkedDependents,detachSceneLayout,solveSceneLayout} from './scene-layout.js';
import {spatialPath,worldBox,setWorldPosition,transformPoint,inverseMatrix,matrixAngle} from './scene-spatial.js';
import {compileTwoHoleWeaves} from './craft-display.js';
import {validateWebScene} from './web-scene-workbench.js';
import {assetSourceRevision} from './material-anatomy.js';
import {craftDigest,craftSceneHash,recordManagedChanges,layerFingerprint,isManagedUnchanged} from './craft-fingerprint.js';
import {tapeDimensions,createTapeStrip} from './tape-strip.js';
import {runMaterialAlgorithm,editScene,insertSceneNode,patchSceneNode,creationNode,creationLocation,creationNodes,sceneScale} from './creation-scene-core.js';
import {dimension,dimensions,changedNodeProperties,updateCreationNode} from './creation-node-update.js';
import {measureSceneText,reflowSceneText} from './scene-text-layout.js';
import {applyCreationAdvanced} from './creation-advanced.js';

const schema=new Ajv2020({strict:false,allErrors:true}).compile(creationV2RuntimeSchema);
export const executableCreationV2Names=Object.freeze(Object.keys(creationCommandRegistry));
export const describeCreationV2Command=describeCreationCommand;
const scale=sceneScale,allNodes=creationNodes,requireNode=creationNode,locate=creationLocation;
const find=(doc,id)=>allNodes(doc.page.layers).find(node=>[node.id,node.key,node.agentKey,node.creativePieceID].includes(id));
const assetFor=(doc,assets,alias)=>{const id=doc.source.materials.find(row=>row.alias===alias)?.assetID,asset=assets.find(row=>row.id===id);if(!asset)throw Error('素材别名不存在：'+alias);return asset;};
const patch=patchSceneNode;
const processMaterial=(doc,target,steps,assets,mode='append')=>runMaterialAlgorithm(doc,'edit_materials',{items:[{piece:target,mode,operations:steps}]},assets);
function placeFor(doc,place,widthMm,heightMm,rotationDeg=0,parentID=null){return resolveCreationPlace(doc.page,place,{widthMm,heightMm,rotationDeg,parentID});}
function addToParent(doc,id,parent,assets){if(!parent)return doc;const group=requireNode(doc,parent);if(group.type!=='group')throw Error('父级必须是图层组');return editScene(doc,[{op:'move',id:requireNode(doc,id).id,parent:group.id}],assets);}
function finishPlacement(doc,id,place){if(place)applyScenePlacement(doc.page,id,place);return doc;}
function groupBox(doc,ids){
 const boxes=ids.map(id=>worldBox(doc.page,id)),cx=boxes.reduce((sum,b)=>sum+b.cx,0)/boxes.length,cy=boxes.reduce((sum,b)=>sum+b.cy,0)/boxes.length;
 const extent=box=>{const a=box.rotation*Math.PI/180;return [Math.abs(Math.cos(a))*box.w+Math.abs(Math.sin(a))*box.h,Math.abs(Math.sin(a))*box.w+Math.abs(Math.cos(a))*box.h];};
 return {width:Math.max(1,2*Math.max(...boxes.map(b=>Math.abs(b.cx-cx)+extent(b)[0]/2))),height:Math.max(1,2*Math.max(...boxes.map(b=>Math.abs(b.cy-cy)+extent(b)[1]/2)))};
}
function reorder(doc,target,order,assets){
 const at=locate(doc.page.layers,target);if(!at)throw Error('图层不存在：'+target);
 const peers=at.siblings.filter(node=>node!==at.node);let before;
 if(order.before){before=requireNode(doc,order.before).id;if(!peers.some(node=>node.id===before))throw Error('排序目标必须是同级图层');}
 else if(order.after){const index=peers.findIndex(node=>node.id===requireNode(doc,order.after).id);if(index<0)throw Error('排序目标必须是同级图层');before=peers[index+1]?.id;}
 else if(order.edge==='back')before=peers[0]?.id;
 return editScene(doc,[{op:'move',id:at.node.id,parent:at.parent?.id,before}],assets);
}
function finishNode(doc,id,change,assets,{created=false}={}){
 doc=updateCreationNode(doc,id,created&&change.place?{...change,place:{...change.place,rotationDeg:change.place.rotationDeg??0}}:change,assets);
 if(change.order)doc=reorder(doc,id,change.order,assets);
 solveSceneLayout(doc.page);return doc;
}
function displayMaskGeometry(node,asset,region,page){
 const s=scale(page),crop=node.cropRect||{x:0,y:0,width:1,height:1};
 return geometryIntersection(creationRegionGeometry(region,{sourceSize:[asset.physicalWidthMM,asset.physicalHeightMM],localSize:[node.width/s,node.height/s],crop,output:'localRatio'}),rectangleGeometry(0,0,1,1));
}

function splitPhysicalPiece(doc,item,assets,transactionId,index){
 const parent=requireNode(doc,item.target);
 if(parent.type!=='material'||parent.tapeStrip)throw Error('material.split 需要普通实体素材');
 assertNoLinkedDependents(doc.page,parent.id);
 const group=locate(doc.page.layers,item.target)?.parent,asset=assets.find(row=>row.id===parent.assetID);
 if(!asset)throw Error('素材来源不存在');
 const parentCrop=parent.cropRect||{x:0,y:0,width:1,height:1},factor=scale(doc.page),parentWorld=worldBox(doc.page,item.target),angle=parentWorld.rotation*Math.PI/180;
 const pieces=item.pieces.map(part=>{
  if(part.id===item.target||find(doc,part.id))throw Error('新裁片编号已经使用：'+part.id);
  const geometry=creationRegionGeometry(part.region,{sourceSize:[asset.physicalWidthMM,asset.physicalHeightMM],localSize:[parent.width/factor,parent.height/factor],crop:parentCrop});
  if(geometryArea(geometry)<=0)throw Error('分片区域为空：'+part.id);
  const bounds=geometryBounds(geometry),crop={x:bounds.x/asset.physicalWidthMM,y:bounds.y/asset.physicalHeightMM,width:bounds.width/asset.physicalWidthMM,height:bounds.height/asset.physicalHeightMM};
  const u=(crop.x-parentCrop.x)/parentCrop.width,v=(crop.y-parentCrop.y)/parentCrop.height,w=crop.width/parentCrop.width,h=crop.height/parentCrop.height,dx=(u+w/2-.5)*parent.width,dy=(v+h/2-.5)*parent.height;
  const defaultCenter={x:parentWorld.cx+dx*Math.cos(angle)-dy*Math.sin(angle),y:parentWorld.cy+dx*Math.sin(angle)+dy*Math.cos(angle),rotation:parentWorld.rotation};
  const position=part.place?placeFor(doc,part.place,crop.width*asset.physicalWidthMM,crop.height*asset.physicalHeightMM,defaultCenter.rotation-creationRotationFrame(doc.page,part.place,group?.id),group?.id):defaultCenter;
  return {id:part.id,asset:doc.source.materials.find(row=>row.assetID===asset.id)?.alias,sourceRevision:assetSourceRevision(asset),unit:parent.materialUnitIndex||0,parentId:parent.creativePieceID||parent.id,extraction:part.region.shape==='rect'?{type:'rect_crop',boxMM:[bounds.x,bounds.y,bounds.width,bounds.height]}:{type:'geometry',geometryMM:geometry},centerMM:[position.x/factor,position.y/factor],rotationDeg:position.rotation};
 });
 const commandId='v2-'+craftDigest([transactionId,index]).slice(7,31);
 const next=runMaterialAlgorithm(doc,'apply_craft_plan',{format:'shiye-craft-plan',version:2,commandId,baseSceneHash:craftSceneHash(doc.page),pieces,consume:[parent.creativePieceID||parent.id],keepRemainders:item.keepRemainder!==false},assets);
 if(group)for(const piece of pieces)moveSceneNode(next.page,requireNode(next,piece.id).id,{parentID:group.id});
 for(const piece of item.pieces)if(piece.place)finishPlacement(next,piece.id,piece.place);
 return next;
}
function physicalCut(doc,{target,regions,keepRemainders=true},assets,transactionId,index){
 const parent=requireNode(doc,target);
 if(parent.type!=='material'||parent.tapeStrip)throw Error('实体裁切需要普通素材');
 assertNoLinkedDependents(doc.page,parent.id);
 const group=locate(doc.page.layers,target)?.parent,asset=assets.find(row=>row.id===parent.assetID);if(!asset)throw Error('素材来源不存在');
 const source=itemSourceGeometry(parent,asset),crop=parent.cropRect||{x:0,y:0,width:1,height:1},factor=scale(doc.page),world=worldBox(doc.page,target),angle=world.rotation*Math.PI/180,alias=doc.source.materials.find(row=>row.assetID===asset.id)?.alias;
 if(!alias)throw Error('素材别名不存在');
 const pieces=regions.map(({id,geometry,treatments})=>{
  if(find(doc,id)||id===target)throw Error('新裁片编号已经使用：'+id);
  const inside=geometryIntersection(source,geometry);
  if(geometryArea(inside)<=0||Math.abs(geometryArea(inside)-geometryArea(geometry))>1e-5)throw Error('裁片区域超出当前素材');
  const b=geometryBounds(inside),u=(b.x/asset.physicalWidthMM-crop.x)/crop.width,v=(b.y/asset.physicalHeightMM-crop.y)/crop.height,w=b.width/(crop.width*asset.physicalWidthMM),h=b.height/(crop.height*asset.physicalHeightMM),dx=(u+w/2-.5)*parent.width,dy=(v+h/2-.5)*parent.height;
  return {id,asset:alias,sourceRevision:assetSourceRevision(asset),unit:parent.materialUnitIndex||0,parentId:parent.creativePieceID||parent.id,extraction:{type:'geometry',geometryMM:inside},centerMM:[(world.cx+dx*Math.cos(angle)-dy*Math.sin(angle))/factor,(world.cy+dx*Math.sin(angle)+dy*Math.cos(angle))/factor],rotationDeg:world.rotation,z:parent.zIndex||10,...(treatments?.length?{treatments}:{})};
 });
 const commandId='v2-'+craftDigest([transactionId,index,'physical-cut']).slice(7,31);
 const next=runMaterialAlgorithm(doc,'apply_craft_plan',{format:'shiye-craft-plan',version:2,commandId,baseSceneHash:craftSceneHash(doc.page),pieces,consume:[parent.creativePieceID||parent.id],keepRemainders},assets);
 if(group)for(const piece of pieces)moveSceneNode(next.page,requireNode(next,piece.id).id,{parentID:group.id});return next;
}
function tornEdgeStep(node,asset,edge){
 const crop=node.cropRect||{width:1,height:1},side=Math.min(crop.width*asset.physicalWidthMM,crop.height*asset.physicalHeightMM);
 return {op:'edge',style:'torn',edges:['top','right','bottom','left'],depth_mm:Math.max(.1,Math.min(side*.08,(edge.roughness??.2)*3)),period_mm:Math.max(.5,side*.16),seed:edge.seed};
}
const operationValidators=new Map();
export function validateCreationV2Commands(input){
 if(schema(input))return input;
 let error=schema.errors[0],prefix='';
 if(input?.protocolVersion!==2)throw Object.assign(Error('只接受当前统一协议 2；请重新导出创作包。'),{code:'COMMAND_PROTOCOL_INVALID'});
 for(const [index,item] of (Array.isArray(input.operations)?input.operations:[]).entries()){
  const entry=creationCommandRegistry[item?.op];
  if(!entry)throw Object.assign(Error('未知操作：'+item?.op),{code:'COMMAND_SCHEMA_INVALID',operationIndex:index,path:'/operations/'+index+'/op'});
  if(!operationValidators.has(item.op))operationValidators.set(item.op,new Ajv2020({strict:false,allErrors:true}).compile(selfContainedCreationSchema(entry.schema)));
  const check=operationValidators.get(item.op);if(!check(item)){error=check.errors[0];prefix='/operations/'+index;break;}
 }
 const field=error.params.missingProperty||error.params.additionalProperty||'',path=prefix+error.instancePath+(field?'/'+field:'');
 throw Object.assign(Error('commands'+path+' '+error.message+'；使用 describe 查询参数。'),{code:'COMMAND_SCHEMA_INVALID',path,...(prefix?{operationIndex:Number(prefix.split('/')[2])}:{})});
}
export function applyCreationV2Batch(document,input,assets,options={}){
 validateCreationV2Commands(input);let doc=structuredClone(document);
 validateWebScene(doc.page,doc.source,assets,{final:false});
 for(const [index,item] of input.operations.entries())try{
  const beforeOperation=attachSceneV2(structuredClone(doc.page)),s=scale(doc.page);
  for(const id of [item.target,item.strip,...(item.targets||[])].filter(Boolean)){const node=assertSceneEditable(attachSceneV2(doc.page),requireNode(doc,id).id);if(item.op!=='layer.duplicate')assertPolicyOwnership(node,AI_SCENE_POLICY);}
  if(item.op==='text.lettering')doc=addLettering(doc,item,assets,{finishNode});
  else if(item.op==='material.add'){
   if(find(doc,item.id))throw Error('图层编号已经存在：'+item.id);
   const asset=assetFor(doc,assets,item.asset),position=placeFor(doc,item.place,asset.physicalWidthMM,asset.physicalHeightMM,0,item.parent);
   doc=runMaterialAlgorithm(doc,'place_materials',{items:[{asset:item.asset,piece:item.id,x:position.x/s,y:position.y/s,rotation:position.rotation,coordinate_unit:'mm'}]},assets);
   doc=addToParent(doc,item.id,item.parent,assets);doc=finishNode(doc,item.id,item,assets,{created:true});
  }else if(['text.add','graphic.add'].includes(item.op)){
   const common={id:item.id,agentKey:item.id,x:doc.page.canvas.width/2,y:doc.page.canvas.height/2,rotation:0,zIndex:500,opacity:1,blendMode:'normal'};
   let node;
   if(item.op==='text.add'){
    if(item.size.width===undefined)throw Error('文字创建需要 size.width');
    node={...common,type:'text',content:item.content,width:dimension(doc.page,item.size,'width',item.parent)*s,height:1,fontSize:12*25.4/72*s,color:'#334D4A',style:'hand',alignment:'left'};
   }else node=initialGraphicNode(item.id,item.geometry,s);
   Object.assign(node,changedNodeProperties(doc.page,node,item,item.parent));
   doc=insertSceneNode(doc,node,assets);doc=addToParent(doc,item.id,item.parent,assets);doc=finishNode(doc,item.id,{place:item.place,order:item.order,...(item.size?.behavior==='linked'?{size:item.size}:{})},assets,{created:true});
  }else if(item.op==='text.reflow'){
   doc=editScene(doc,[{op:'lettering-reflow',id:requireNode(doc,item.target).id,change:item}],assets);
  }else if(item.op==='layer.update'){
   doc=finishNode(doc,item.target,item,assets);
  }else if(item.op==='layer.reparent'){
   if(item.parent!==null&&requireNode(doc,item.parent).type!=='group')throw Error('父级必须是组合');
   doc=editScene(doc,[{op:'move',id:requireNode(doc,item.target).id,parent:item.parent?requireNode(doc,item.parent).id:null}],assets);
   if(item.order)doc=reorder(doc,item.target,item.order,assets);
  }else if(item.op==='layer.delete'){
   if(item.dependentLinks==='detach')detachLinkedDependents(doc.page,requireNode(doc,item.target).id);
   doc=editScene(doc,[{op:'delete',id:requireNode(doc,item.target).id}],assets);
  }else if(item.op==='group.create'){
   const targets=item.targets.map(id=>requireNode(doc,id).id),bounds=item.layoutBox?{width:item.layoutBox.width*s,height:item.layoutBox.height*s}:groupBox(doc,targets);
   doc=editScene(doc,[{op:'group',ids:targets,id:item.id,name:item.id,spatial:true,layoutBox:bounds}],assets);doc=addToParent(doc,item.id,item.parent,assets);doc=finishNode(doc,item.id,item,assets,{created:true});
  }else if(item.op==='group.compose'){
   if(find(doc,item.id))throw Error('组合编号已经存在');
   const group={id:item.id,type:'group',name:item.id,children:[],localTransform:[1,0,0,1,0,0],layoutBox:item.layoutBox?{width:item.layoutBox.width*s,height:item.layoutBox.height*s}:item.parent&&requireNode(doc,item.parent).layoutBox?{...requireNode(doc,item.parent).layoutBox}:{width:doc.page.canvas.width,height:doc.page.canvas.height},opacity:1,blendMode:'normal',zIndex:500};
   doc=insertSceneNode(doc,group,assets,item.parent);doc=finishNode(doc,item.id,item,assets,{created:true});
   for(const [childIndex,child] of item.children.entries()){
    if(child.parent&&child.parent!==item.id)throw Error('组合子操作不能指向其他父级');
    if(['page.update','material.decision','layer.duplicate'].includes(child.op))throw Error('组合内不支持全局或跨实例操作');
    for(const target of [child.target,child.strip,...(child.targets||[])].filter(Boolean))if(!spatialPath(doc.page.layers,requireNode(doc,target).id)?.ancestors.some(group=>group.id===item.id))throw Error('组合内不能修改外部对象：'+target);
    const creates=['material.add','text.add','graphic.add','material.tape','text.lettering','group.compose'].includes(child.op);
    doc=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:'child-'+craftDigest([input.transactionId,index,childIndex]).slice(7,39),baseSceneRevision:input.baseSceneRevision,operations:[creates?{...child,parent:item.id}:child]},assets,options);
   }
  }else if(item.op==='group.ungroup'){
   if(item.dependentLinks==='detach')detachLinkedDependents(doc.page,requireNode(doc,item.target).id);
   doc=editScene(doc,[{op:'ungroup',id:requireNode(doc,item.target).id}],assets);
  }else if(item.op==='layout.arrange')arrangeCreationNodes(doc.page,item.targets.map(id=>requireNode(doc,id).id),item.rule,item.container);
  else if(item.op==='layout.detach')detachSceneLayout(doc.page,requireNode(doc,item.target).id,item.scope||'all');
  else if(item.op==='material.cut'){
   const node=requireNode(doc,item.target);if(node.type!=='material'||node.tapeStrip)throw Error('material.cut 需要普通实体素材');
   if(node.craftWindowIDs?.length)throw Error('命名开窗素材不能由普通裁切隐式重编号；请先完成穿插或恢复');
   const asset=assets.find(row=>row.id===node.assetID),crop=node.cropRect||{x:0,y:0,width:1,height:1};
   const region=creationRegionGeometry(item.region,{sourceSize:[asset.physicalWidthMM,asset.physicalHeightMM],localSize:[node.width/s,node.height/s],crop});
   const source=itemSourceGeometry(node,asset),result=item.mode==='keep'?geometryIntersection(source,region):geometryDifference(source,region);
   if(geometryArea(result)<=1e-8)throw Error('裁切结果为空；不提交');
   const bounds=geometryBounds(result);if(Math.min(bounds.width,bounds.height)<2-1e-7)throw Error('实体裁片短边不能小于 2 mm');
   if(item.resultId){
    doc=physicalCut(doc,{target:item.target,regions:[{id:item.resultId,geometry:result}],keepRemainders:item.keepRemainder===true},assets,input.transactionId,index);
   }else{
    const local=transformGeometry(region,p=>[(p[0]/asset.physicalWidthMM-crop.x)/crop.width,(p[1]/asset.physicalHeightMM-crop.y)/crop.height]);
    // Same geometry mode for rectangles, bands, paths and half planes.
    doc=processMaterial(doc,item.target,[{op:'cut_shape',shape:'geometry',mode:item.mode,unit:'ratio',geometry:local}],assets);
   }
  }else if(item.op==='material.split')doc=splitPhysicalPiece(doc,item,assets,input.transactionId,index);
  else if(item.op==='material.tape'){
   const asset=assetFor(doc,assets,item.asset);if(asset.kind!=='tape')throw Error('material.tape 需要胶带素材');
   const pts=item.path?.points||[[-item.lengthMm/2,0],[item.lengthMm/2,0]],t=item.texture||{},c=item.caps||{};
   const node=createTapeStrip(asset,doc.page,pts.map(p=>p.map(v=>v*s)),500,{pathMode:'polyline',widthMM:item.widthMm,textureMode:t.mode,sourceOffsetMM:t.offsetMm,sourceWindowMM:t.windowMm,...(t.repeatRangeMm?{repeatRangeMM:t.repeatRangeMm}:{}),reverseTexture:t.reverse,startCap:c.start,endCap:c.end,capDepthMM:c.depthMm});
   node.id=item.id;node.creativePieceID=item.id;node.materialUnitIndex=Math.max(-1,...allNodes(doc.page.layers).filter(n=>n.type==='material'&&n.assetID===asset.id).map(n=>n.materialUnitIndex||0))+1;node.type='material';doc=insertSceneNode(doc,node,assets);doc=addToParent(doc,item.id,item.parent,assets);doc=finishNode(doc,item.id,item,assets,{created:true});
  }else if(item.op==='material.edge'){
   const node=requireNode(doc,item.target);if(node.type!=='material'||node.tapeStrip)throw Error('material.edge 需要普通实体素材');
   const asset=assets.find(row=>row.id===node.assetID);
   if(item.edge.style==='clean'){const steps=(node.materialSteps||[]).filter(step=>step.op!=='edge');doc=processMaterial(doc,item.target,steps.length?steps:[{op:'whole'}],assets,'replace');}
   else doc=processMaterial(doc,item.target,[edgeStep(node,asset,item.edge)],assets);
  }else if(item.op==='material.window'){
   const node=requireNode(doc,item.target);if(node.type!=='material'||node.tapeStrip)throw Error('material.window 需要普通实体素材');
   if(node.craftWindowIDs?.includes(item.windowId))throw Error('实体开窗编号重复');
   const asset=assets.find(row=>row.id===node.assetID),crop=node.cropRect||{x:0,y:0,width:1,height:1},opening=creationRegionGeometry(item.region,{sourceSize:[asset.physicalWidthMM,asset.physicalHeightMM],localSize:[node.width/s,node.height/s],crop});
   if(item.keepRemainder||item.cutoutId||item.resultId&&item.resultId!==item.target){
    const source=itemSourceGeometry(node,asset),main=geometryDifference(source,opening),cutout=geometryIntersection(source,opening),resultId=item.resultId&&item.resultId!==item.target?item.resultId:item.target+'-window-'+craftDigest([input.transactionId,index]).slice(7,15),pieces=[{id:resultId,geometry:main}];
    if(item.keepRemainder||item.cutoutId)pieces.push({id:item.cutoutId||item.windowId+'-cutout',geometry:cutout});
    doc=physicalCut(doc,{target:item.target,regions:pieces,keepRemainders:item.keepRemainder!==false},assets,input.transactionId,index);
    const metadataBefore=attachSceneV2(structuredClone(doc.page));requireNode(doc,resultId).craftWindowIDs=[...(node.craftWindowIDs||[]),item.windowId];recordManagedChanges(metadataBefore,attachSceneV2(doc.page));
    if(item.edge&&item.edge.style!=='clean')doc=processMaterial(doc,resultId,[edgeStep(requireNode(doc,resultId),asset,item.edge)],assets);
   }else{
    const before=node.materialMask?.holes?.length||0;if(before!==(node.craftWindowIDs?.length||0))throw Error('既有孔洞缺少稳定编号');
    const previous=[...(node.craftWindowIDs||[])],metadataBefore=attachSceneV2(structuredClone(doc.page));delete node.craftWindowIDs;recordManagedChanges(metadataBefore,attachSceneV2(doc.page));
    const steps=[{op:'cut_shape',shape:'geometry',mode:'remove',unit:'ratio',geometry:displayMaskGeometry(node,asset,item.region,doc.page)}];
    if(item.edge&&item.edge.style!=='clean')steps.push(edgeStep(node,asset,item.edge));doc=processMaterial(doc,item.target,steps,assets);
    const updated=requireNode(doc,item.target);if((updated.materialMask?.holes?.length||0)!==before+1)throw Error('实体开窗未产生独立孔洞');updated.craftWindowIDs=[...previous,item.windowId];
   }
  }else if(item.op==='material.weave'){
   if(requireNode(doc,item.strip).type!=='material')throw Error('穿插纸条必须是实体素材');
   const through=item.through.map(entry=>{const target=requireNode(doc,entry.target);if(target.type!=='material')throw Error('穿插目标必须是实体素材');const hole=target.craftWindowIDs?.indexOf(entry.window)??-1;if(hole<0)throw Error('穿插引用的开窗不存在');return {target:target.creativePieceID||target.id,hole,sideAfter:entry.sideAfter};});
   attachSceneV2(doc.page);compileTwoHoleWeaves(doc.page,[{piece:item.strip,through}]);
  }else if(item.op==='material.decision'){
   assetFor(doc,assets,item.asset);doc.materialDecisions=(doc.materialDecisions||[]).filter(row=>row.asset!==item.asset);doc.materialDecisions.push({asset:item.asset,choice:item.choice,reason:item.reason});
  }else if(item.op==='page.update'){
   const values={};
   if(item.paperColor!==undefined)values.paperColor=item.paperColor;if(item.paperPattern!==undefined)values.paperPattern=item.paperPattern;
   if(item.rulingMm!==undefined){if(item.rulingMm<=0)values.paperRuling=undefined;else {const step=item.rulingMm*s,h=doc.page.canvas.height;if(h/step>2000)throw Error('纸张横线超过预算，请增大 rulingMm');values.paperRuling={rowPositions:Array.from({length:Math.ceil(h/step)-1},(_,i)=>(i+1)*step/h).filter(y=>y<1),spans:[{from:0,to:1}],color:'#d0d2d3',relativeLineWidth:1/h};}}
   if(item.centerGutter!==undefined)values.drawCenterGutter=item.centerGutter;
   applyScenePagePatch(doc.page,values,{policy:AI_SCENE_POLICY});
  }else doc=applyCreationAdvanced(doc,item,assets,{...options,finishNode,processMaterial,assetFor});
  solveSceneLayout(doc.page);
  const afterNodes=new Map(allNodes(doc.page.layers).map(n=>[n.id,n]));
  for(const previous of allNodes(beforeOperation.layers))if(previous.isLocked||previous.locked||previous.aiManaged&&!isManagedUnchanged(previous)){
   const next=afterNodes.get(previous.id);if(!next||layerFingerprint(previous)!==layerFingerprint(next))throw Object.assign(Error('不能覆盖锁定或用户接管的图层：'+previous.id),{code:'MANUAL_EDIT_PROTECTED'});
  }
  validateWebScene(doc.page,doc.source,assets,{final:false});recordManagedChanges(beforeOperation,attachSceneV2(doc.page));
 }catch(error){throw Object.assign(Error('operations['+index+'] '+item.op+': '+error.message),{code:error.code||'OPERATION_FAILED',operationIndex:index,path:error.path});}
 return doc;
}
function edgeStep(node,asset,edge){
 const crop=node.cropRect||{width:1,height:1},side=Math.min(crop.width*asset.physicalWidthMM,crop.height*asset.physicalHeightMM);
 return {op:'edge',style:edge.style,edges:edge.edges||['top','right','bottom','left'],depth_mm:edge.depthMm??Math.max(.1,Math.min(side*.08,(edge.roughness??.2)*3)),period_mm:edge.periodMm??Math.max(.5,side*.16),...(edge.seed===undefined?{}:{seed:edge.seed}),...(edge.position===undefined?{}:{position:edge.position})};
}

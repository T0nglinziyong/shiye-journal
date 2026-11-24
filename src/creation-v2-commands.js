import {buildCraftEdge} from './craft-geometry.js';
import {compileTitleOperations,compilePaperObject,mergeObjectPatch} from './creation-semantic-objects.js';
import {splitLineGeometry} from './creation-split-geometry.js';
import {expandCreationUpdate} from './creation-update-patch.js';
import {tearRegionGeometry} from './creation-tear.js';
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
import {materialMaskGeometry} from './material-mask.js';
import {edgeAlignment} from './creation-edge-alignment.js';
import {creationRegionGeometry} from './creation-region.js';
import {attachSceneV2,assertSceneEditable,groupSceneLayers,moveSceneNode} from './scene-v2.js';
import {applyScenePlacement,assertNoLinkedDependents,detachLinkedDependents,detachSceneLayout,solveSceneLayout} from './scene-layout.js';
import {spatialPath,worldBox,setWorldPosition,transformPoint,inverseMatrix,matrixAngle} from './scene-spatial.js';
import {applySceneWeave} from './scene-weave-edit.js';
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
function surfaceOf(doc,id){const path=spatialPath(doc.page.layers,requireNode(doc,id).id),root=path.ancestors[0]||path.node;return root.isParked?root.workspaceId||'tray':'page';}
function addToParent(doc,id,parent,assets){if(!parent)return doc;const group=requireNode(doc,parent);if(group.type!=='group')throw Error('父级必须是图层组');doc=editScene(doc,[{op:'move',id:requireNode(doc,id).id,parent:group.id}],assets);return patch(doc,id,{isParked:false,workspaceId:'page'},assets);}
function finishPlacement(doc,id,place){if(place)applyScenePlacement(doc.page,id,place);return doc;}
function reorder(doc,target,order,assets){
 const at=locate(doc.page.layers,target);if(!at)throw Error('图层不存在：'+target);
 const peers=at.siblings.filter(node=>node!==at.node).sort((a,b)=>(a.zIndex??0)-(b.zIndex??0));let before;
 if(order.before){before=requireNode(doc,order.before).id;if(!peers.some(node=>node.id===before))throw Error('排序目标必须是同级图层');}
 else if(order.after){const index=peers.findIndex(node=>node.id===requireNode(doc,order.after).id);if(index<0)throw Error('排序目标必须是同级图层');before=peers[index+1]?.id;}
 else if(order.edge==='back')before=peers[0]?.id;
 return editScene(doc,[{op:'move',id:at.node.id,parent:at.parent?.id,before}],assets);
}
function finishNode(doc,id,change,assets,{created=false}={}){
 const parent=locate(doc.page.layers,id)?.parent;
 if(parent&&change.place?.surface&&change.place.surface!==surfaceOf(doc,parent.id))throw Error('组合子对象不能单独移往其他工作空间；请移动整个组合或先解除组合');
 doc=updateCreationNode(doc,id,created&&change.place?{...change,place:{...change.place,rotationDeg:change.place.rotationDeg??0}}:change,assets);
 if(parent&&change.place?.surface)doc=patch(doc,id,{isParked:false,workspaceId:'page'},assets);
 if(change.order)doc=reorder(doc,id,change.order,assets);
 else if(created){
  // Command order is paint order across all node types. The underlying
  // material/text algorithms have different historical default z values.
  // Change only the new node so locked/user-owned siblings stay untouched.
  const at=locate(doc.page.layers,id);
  const zIndex=Math.max(-1,...at.siblings.filter(n=>n!==at.node).map(n=>n.zIndex??0))+1;
  doc=patch(doc,id,{zIndex},assets);
 }
 solveSceneLayout(doc.page);return doc;
}
function addMaterialNode(doc,item,assets){
 if(find(doc,item.id))throw Error('图层编号已经存在：'+item.id);
 const asset=assetFor(doc,assets,item.asset),s=scale(doc.page),position=placeFor(doc,item.place,asset.physicalWidthMM,asset.physicalHeightMM,0,item.parent);
 doc=runMaterialAlgorithm(doc,'place_materials',{items:[{asset:item.asset,piece:item.id,x:position.x/s,y:position.y/s,rotation:position.rotation,coordinate_unit:'mm',
   ...(asset.isCreativePreset?{unit:Math.max(-1,...allNodes(doc.page.layers).filter(node=>node.type==='material'&&node.assetID===asset.id).map(node=>node.materialUnitIndex??0))+1}:{})}]},assets);
 doc=addToParent(doc,item.id,item.parent,assets);return finishNode(doc,item.id,item,assets,{created:true});
}
function displayMaskGeometry(node,asset,region,page){
 const s=scale(page),crop=node.cropRect||{x:0,y:0,width:1,height:1};
 return geometryIntersection(creationRegionGeometry(region,{sourceSize:[asset.physicalWidthMM,asset.physicalHeightMM],localSize:[node.width/s,node.height/s],crop,output:'localRatio'}),rectangleGeometry(0,0,1,1));
}

function sourceHoles(node,asset){
 const crop=node.cropRect||{x:0,y:0,width:1,height:1};
 return (materialMaskGeometry(node.materialMask)?.holes||[]).map(ring=>normalizeGeometry([[ring.map(([x,y])=>[(crop.x+x*crop.width)*asset.physicalWidthMM,(crop.y+y*crop.height)*asset.physicalHeightMM])]]));
}
function namedSourceHoles(node,asset){
 const holes=sourceHoles(node,asset),ids=node.craftWindowIDs||[];
 if(holes.length!==ids.length)throw Error('既有孔洞缺少稳定编号');
 return holes.map((geometry,i)=>({id:ids[i],geometry}));
}
function assignWindowIDs(node,asset,named){
 const holes=sourceHoles(node,asset),used=new Set();
 if(holes.length!==named.length)throw Error('实体开窗未产生独立孔洞');
 node.craftWindowIDs=holes.map(hole=>{
  const candidates=named.filter(({id,geometry})=>!used.has(id)&&geometryArea(geometryDifference(hole,geometry))+geometryArea(geometryDifference(geometry,hole))<1e-5);
  if(candidates.length!==1)throw Error('开窗边界发生合并或变化，无法保留稳定编号');
  used.add(candidates[0].id);return candidates[0].id;
 });
}

function preserveReplacementStack(original,target,next,pieceIDs){
 const beforeStack=attachSceneV2(structuredClone(next.page));
 const location=locate(original.page.layers,target);
 const ordered=[...location.siblings].sort((a,b)=>(a.zIndex??0)-(b.zIndex??0));
 const following=ordered.slice(ordered.indexOf(location.node)+1).find(node=>find(next,node.id));
 for(const id of pieceIDs)moveSceneNode(next.page,requireNode(next,id).id,{parentID:location.parent?.id||null,beforeID:following?.id||null});
 // Reparenting normalizes sibling z values. Restore unaffected peers (some
 // may be locked or user-edited); replacement pieces occupy the original slot.
 for(const peer of location.siblings){const surviving=find(next,peer.id);if(surviving)surviving.zIndex=peer.zIndex;}
 for(const id of pieceIDs)requireNode(next,id).zIndex=location.node.zIndex??0;
 if(location.node.isParked)for(const id of pieceIDs){requireNode(next,id).isParked=true;requireNode(next,id).workspaceId=location.node.workspaceId||'tray';}
 recordManagedChanges(beforeStack,attachSceneV2(next.page));
 return next;
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
  return {id:part.id,asset:doc.source.materials.find(row=>row.assetID===asset.id)?.alias,sourceRevision:assetSourceRevision(asset),unit:parent.materialUnitIndex||0,parentId:parent.creativePieceID||parent.id,extraction:part.region.shape==='rect'?{type:'rect_crop',boxMM:[bounds.x,bounds.y,bounds.width,bounds.height]}:{type:'geometry',geometryMM:geometry},centerMM:[position.x/factor,position.y/factor],rotationDeg:position.rotation,z:parent.zIndex??10};
 });
 const commandId='v2-'+craftDigest([transactionId,index]).slice(7,31);
 let next=runMaterialAlgorithm(doc,'apply_craft_plan',{format:'shiye-craft-plan',version:2,commandId,baseSceneHash:craftSceneHash(doc.page),pieces,consume:[parent.creativePieceID||parent.id],keepRemainders:item.keepRemainder!==false},assets);
 preserveReplacementStack(doc,item.target,next,pieces.map(piece=>piece.id));
 for(const piece of item.pieces)if(piece.place||piece.order)next=placeOutput(next,piece,assets);
 return next;
}
function physicalCut(doc,{target,regions,keepRemainders=true},assets,transactionId,index){
 const parent=requireNode(doc,target);
 if(parent.type!=='material'||parent.tapeStrip)throw Error('实体裁切需要普通素材');
 assertNoLinkedDependents(doc.page,parent.id);
 const asset=assets.find(row=>row.id===parent.assetID);if(!asset)throw Error('素材来源不存在');
 const source=itemSourceGeometry(parent,asset),crop=parent.cropRect||{x:0,y:0,width:1,height:1},factor=scale(doc.page),world=worldBox(doc.page,target),angle=world.rotation*Math.PI/180,alias=doc.source.materials.find(row=>row.assetID===asset.id)?.alias;
 if(!alias)throw Error('素材别名不存在');
 const pieces=regions.map(({id,geometry,treatments})=>{
  if(find(doc,id)||id===target)throw Error('新裁片编号已经使用：'+id);
  const inside=geometryIntersection(source,geometry);
  if(geometryArea(inside)<=0||Math.abs(geometryArea(inside)-geometryArea(geometry))>1e-5)throw Error('裁片区域超出当前素材');
  const b=geometryBounds(inside),u=(b.x/asset.physicalWidthMM-crop.x)/crop.width,v=(b.y/asset.physicalHeightMM-crop.y)/crop.height,w=b.width/(crop.width*asset.physicalWidthMM),h=b.height/(crop.height*asset.physicalHeightMM),dx=(u+w/2-.5)*parent.width,dy=(v+h/2-.5)*parent.height;
  return {id,asset:alias,sourceRevision:assetSourceRevision(asset),unit:parent.materialUnitIndex||0,parentId:parent.creativePieceID||parent.id,extraction:{type:'geometry',geometryMM:inside},centerMM:[(world.cx+dx*Math.cos(angle)-dy*Math.sin(angle))/factor,(world.cy+dx*Math.sin(angle)+dy*Math.cos(angle))/factor],rotationDeg:world.rotation,z:parent.zIndex??10,...(treatments?.length?{treatments}:{})};
 });
 const commandId='v2-'+craftDigest([transactionId,index,'physical-cut']).slice(7,31);
 let next=runMaterialAlgorithm(doc,'apply_craft_plan',{format:'shiye-craft-plan',version:2,commandId,baseSceneHash:craftSceneHash(doc.page),pieces,consume:[parent.creativePieceID||parent.id],keepRemainders},assets);
 preserveReplacementStack(doc,target,next,pieces.map(piece=>piece.id));return next;
}
function tornEdgeStep(node,asset,edge){
 const crop=node.cropRect||{width:1,height:1},side=Math.min(crop.width*asset.physicalWidthMM,crop.height*asset.physicalHeightMM);
 return {op:'edge',style:'torn',edges:['top','right','bottom','left'],depth_mm:Math.max(.1,Math.min(side*.08,(edge.roughness??.2)*3)),period_mm:Math.max(.5,side*.16),seed:edge.seed};
}
const operationValidators=new Map();
// AJV emits failures for every union alternative. Its first error may belong
// to an unrelated geometry (e.g. saying a path's valid viewBox is forbidden).
// Prefer a concrete, deeper field failure over a union's summary or a missing
// field from another alternative. Keep the schema strict; only diagnostics change.
function actionableSchemaError(errors){
 const score=error=>{
  const field=error.params.missingProperty||error.params.additionalProperty;
  const depth=error.instancePath.split('/').filter(Boolean).length+(field?1:0);
  const priority=['oneOf','anyOf','if'].includes(error.keyword)?-100:error.keyword==='required'?0:1;
  return depth*10+priority;
 };
 return [...errors].sort((a,b)=>score(b)-score(a))[0];
}
export function validateCreationV2Commands(input){
 if(schema(input))return input;
 let error=schema.errors[0],prefix='';
 if(input?.protocolVersion!==2)throw Object.assign(Error('只接受当前统一协议 2；请重新导出创作包。'),{code:'COMMAND_PROTOCOL_INVALID'});
 for(const [index,item] of (Array.isArray(input.operations)?input.operations:[]).entries()){
  const entry=creationCommandRegistry[item?.op];
  if(!entry)throw Object.assign(Error('未知操作：'+item?.op),{code:'COMMAND_SCHEMA_INVALID',operationIndex:index,path:'/operations/'+index+'/op'});
  if(!operationValidators.has(item.op))operationValidators.set(item.op,new Ajv2020({strict:false,allErrors:true}).compile(selfContainedCreationSchema(entry.schema)));
  const check=operationValidators.get(item.op);if(!check(item)){error=actionableSchemaError(check.errors);prefix='/operations/'+index;break;}
 }
 const field=error.params.missingProperty||error.params.additionalProperty||'',path=prefix+error.instancePath+(field?'/'+field:'');
 throw Object.assign(Error('commands'+path+' '+error.message+'；使用 describe 查询参数。'),{code:'COMMAND_SCHEMA_INVALID',path,...(prefix?{operationIndex:Number(prefix.split('/')[2])}:{})});
}
export function applyCreationV2Batch(document,input,assets,options={}){
 validateCreationV2Commands(input);let doc=structuredClone(document);
 validateWebScene(doc.page,doc.source,assets,{final:false});
 for(const [index,rawItem] of input.operations.entries())try{
  const item={...rawItem};
  if(item.op==='layer.duplicate'&&!item.place&&item.parent===undefined)item.parent=null;
  if(['material.add','text.add','graphic.add','paper.add','title.add','text.lettering','group.compose','material.tape','layer.duplicate'].includes(item.op)&&!item.place)item.place=item.parent?{reference:'parent',at:[.5,.5],unit:'ratio'}:{reference:'page',at:[.5,.5],unit:'ratio',surface:'tray'};
  const beforeOperation=attachSceneV2(structuredClone(doc.page)),s=scale(doc.page);
  for(const id of [item.target,item.strip,...(item.targets||[])].filter(Boolean)){const node=assertSceneEditable(attachSceneV2(doc.page),requireNode(doc,id).id);if(item.op!=='layer.duplicate')assertPolicyOwnership(node,AI_SCENE_POLICY);}
  if(['paper.add','title.add'].includes(item.op)){
   const compiled=item.op==='paper.add'?compilePaperObject(item):compileTitleOperations({titles:[item]})[0];
   delete compiled.parent;if(item.parent)compiled.parent=item.parent;
   doc=applyCreationV2Batch(doc,{...input,transactionId:input.transactionId+'-object',operations:[compiled]},assets,options);
   const node=requireNode(doc,item.id);
   const {op,place,order,parent,id,...parameters}=item;
   setCreationObject(doc,item.id,{kind:op==='paper.add'?'paper':'title',parameters});
   if(op==='paper.add'&&item.edge)doc=applyPaperEdge(doc,item.id,item.edge,assets);
  }else if(item.op==='text.lettering')doc=addLettering(doc,item,assets,{finishNode});
  else if(item.op==='material.add'){
   doc=addMaterialNode(doc,item,assets);
  }else if(['text.add','graphic.add'].includes(item.op)){
   const common={id:item.id,agentKey:item.id,x:doc.page.canvas.width/2,y:doc.page.canvas.height/2,rotation:0,zIndex:500,opacity:1,blendMode:'normal'};
   let node;
   if(item.op==='text.add'){
    if(item.size.width===undefined)throw Error('文字创建需要 size.width');
    node={...common,type:'text',content:item.content,width:dimension(doc.page,item.size,'width',item.parent)*s,height:1,fontSize:12*25.4/72*s,color:'#334D4A',style:'hand',alignment:'left'};
   }else node=initialGraphicNode(item.id,item.geometry,s,item.style);
   Object.assign(node,changedNodeProperties(doc.page,node,item,item.parent));
   doc=insertSceneNode(doc,node,assets);doc=addToParent(doc,item.id,item.parent,assets);doc=finishNode(doc,item.id,{place:item.place,order:item.order,...(item.size?.behavior==='linked'?{size:item.size}:{})},assets,{created:true});
  }else if(item.op==='text.reflow'){
   doc=editScene(doc,[{op:'lettering-reflow',id:requireNode(doc,item.target).id,change:item}],assets);
  }else if(item.op==='layer.update'){
   if(item.place&&(item.place.at||item.place.referenceAnchor)&&!item.place.surface&&item.place.reference?.startsWith('page'))item.place={...item.place,surface:'page'};
   const node=requireNode(doc,item.target);
   if(node.creationObject)doc=updateSemanticObject(doc,item,assets,input,options);
   else {
    if(node.type==='material'&&item.edge){
     const last=(node.materialSteps||[]).filter(step=>step.op==='edge').at(-1);
     const edge={style:last?.style||'torn',seed:last?.seed??42,...(last?.edges?{edges:last.edges}:{}),...(last?.depth_mm!==undefined?{depthMm:last.depth_mm}:{}),...(last?.period_mm!==undefined?{periodMm:last.period_mm}:{}),...item.edge};
     if(item.edge.roughness!==undefined&&item.edge.depthMm===undefined)delete edge.depthMm;
     if(last&&edge.style!=='clean'){
      const steps=structuredClone(node.materialSteps),at=steps.map(step=>step.op).lastIndexOf('edge');steps[at]=edgeStep(node,assets.find(a=>a.id===node.assetID),edge);
      doc=processMaterial(doc,node.id,steps,assets,'replace');
     }else doc=applyCreationV2Batch(doc,{...input,operations:[{op:'material.edge',target:node.id,edge}]},assets,options);
     delete item.edge;
    }
    const special=['effect','accentColor','layout','curveHeightMm','backdrop','runs','gapMm','texture','edge','pattern','translucency','rows','columns'];
    if(special.some(key=>key in item))throw Error('该对象不支持纸张或标题专属字段');
    doc=finishNode(doc,item.target,expandCreationUpdate(doc.page,node.id,item),assets);
   }
  }else if(item.op==='layer.reparent'){
   if(item.parent!==null&&requireNode(doc,item.parent).type!=='group')throw Error('父级必须是组合');
   const surface=surfaceOf(doc,item.target);
   doc=editScene(doc,[{op:'move',id:requireNode(doc,item.target).id,parent:item.parent?requireNode(doc,item.parent).id:null}],assets);
   doc=patch(doc,item.target,item.parent?{isParked:false,workspaceId:'page'}:{isParked:surface!=='page',workspaceId:surface},assets);
   if(item.order)doc=reorder(doc,item.target,item.order,assets);
  }else if(item.op==='layer.stack'){
   const target=requireNode(doc,item.target),reference=requireNode(doc,item.reference);
   if(target.id===reference.id)throw Error('不能以自身作为层序参照');
   const referencePath=spatialPath(doc.page.layers,reference.id);
   if(referencePath.ancestors.some(node=>node.id===target.id))throw Error('不能把组合移到自己的子节点旁边');
   if(surfaceOf(doc,target.id)!==surfaceOf(doc,reference.id))throw Error('不同工作空间的对象须先移到同一区域再调整层序');
   const referenceParent=referencePath.ancestors.at(-1)?.id||null;
   const targetParent=spatialPath(doc.page.layers,target.id).ancestors.at(-1)?.id||null;
   if(targetParent!==referenceParent){
    doc=editScene(doc,[{op:'move',id:target.id,parent:referenceParent}],assets);
    if(referenceParent)doc=patch(doc,target.id,{isParked:false,workspaceId:'page'},assets);
   }
   doc=reorder(doc,target.id,{[item.side]:reference.id},assets);
  }else if(item.op==='layer.delete'){
   if(item.dependentLinks==='detach')detachLinkedDependents(doc.page,requireNode(doc,item.target).id);
   doc=editScene(doc,[{op:'delete',id:requireNode(doc,item.target).id}],assets);
  }else if(item.op==='group.create'){
   const targets=item.targets.map(id=>requireNode(doc,id).id),bounds=item.layoutBox?{width:item.layoutBox.width*s,height:item.layoutBox.height*s}:undefined;
   if(new Set(targets).size!==targets.length)throw Error('编组对象不能重复');
   const surfaces=targets.map(id=>surfaceOf(doc,id));
   if(surfaces.some(value=>value!==surfaces[0]))throw Error('不同工作空间的对象须先移到同一区域再编组');
   const paths=targets.map(id=>spatialPath(doc.page.layers,id));
   if(paths.some(path=>path.ancestors.some(node=>targets.includes(node.id))))throw Error('不能同时编入组合及其子节点');
   const parents=paths.map(path=>path.ancestors.at(-1)?.id||null);
   const destination=item.parent?requireNode(doc,item.parent).id:parents.every(id=>id===parents[0])?parents[0]:null;
   if(destination&&requireNode(doc,destination).type!=='group')throw Error('父级必须是组合');
   if(destination&&targets.some(id=>id===destination||spatialPath(doc.page.layers,destination).ancestors.some(node=>node.id===id)))throw Error('目标父级不能位于待编组合内部');
   if(parents.some(id=>id!==destination)){
    for(const id of targets)if((spatialPath(doc.page.layers,id).ancestors.at(-1)?.id||null)!==destination){
     doc=editScene(doc,[{op:'move',id,parent:destination}],assets);
     if(destination)doc=patch(doc,id,{isParked:false,workspaceId:'page'},assets);
     else if(surfaces[0]!=='page')doc=patch(doc,id,{isParked:true,workspaceId:surfaces[0]},assets);
    }
   }
   doc=editScene(doc,[{op:'group',ids:targets,id:item.id,name:item.id,layoutBox:bounds}],assets);
   for(const id of targets){const node=requireNode(doc,id);if(node.isParked||node.workspaceId&&node.workspaceId!=='page')doc=patch(doc,id,{isParked:false,workspaceId:'page'},assets);}
   if(surfaces[0]!=='page')doc=patch(doc,item.id,{isParked:true,workspaceId:surfaces[0]},assets);
   doc=addToParent(doc,item.id,item.parent,assets);
   doc=finishNode(doc,item.id,item,assets,{created:true});
  }else if(item.op==='group.compose'){
   if(find(doc,item.id))throw Error('组合编号已经存在');
   const group={id:item.id,type:'group',name:item.id,children:[],localTransform:[1,0,0,1,0,0],layoutBox:item.layoutBox?{width:item.layoutBox.width*s,height:item.layoutBox.height*s}:item.parent&&requireNode(doc,item.parent).layoutBox?{...requireNode(doc,item.parent).layoutBox}:{width:doc.page.canvas.width,height:doc.page.canvas.height},opacity:1,blendMode:'normal',zIndex:500};
   doc=insertSceneNode(doc,group,assets,item.parent);doc=finishNode(doc,item.id,item,assets,{created:true});
   for(const [childIndex,child] of item.children.entries()){
    if(child.parent&&child.parent!==item.id)throw Error('组合子操作不能指向其他父级');
    if(['page.update','material.decision','layer.duplicate'].includes(child.op))throw Error('组合内不支持全局或跨实例操作');
    for(const target of [child.target,child.strip,...(child.targets||[])].filter(Boolean))if(!spatialPath(doc.page.layers,requireNode(doc,target).id)?.ancestors.some(group=>group.id===item.id))throw Error('组合内不能修改外部对象：'+target);
    const creates=['material.add','text.add','graphic.add','paper.add','title.add','material.tape','text.lettering','group.compose'].includes(child.op);
    doc=applyCreationV2Batch(doc,{protocolVersion:2,transactionId:'child-'+craftDigest([input.transactionId,index,childIndex]).slice(7,39),baseSceneRevision:input.baseSceneRevision,operations:[creates?{...child,parent:item.id}:child]},assets,options);
   }
  }else if(item.op==='group.ungroup'){
   const group=requireNode(doc,item.target),members=(group.children||[]).map(child=>child.id),parts=(item.pieces||[]).map(part=>({...part,id:requireNode(doc,part.id).id})),surface=locate(doc.page.layers,item.target)?.parent?'page':surfaceOf(doc,item.target);
   if(item.dependentLinks==='detach')detachLinkedDependents(doc.page,group.id);
   doc=editScene(doc,[{op:'ungroup',id:group.id}],assets);
   for(const id of members)doc=patch(doc,id,{isParked:surface!=='page',workspaceId:surface},assets);
   const seen=new Set();for(const part of parts){if(!members.includes(part.id)||seen.has(part.id))throw Error('解组 pieces 必须是不重复的直接子对象 id');seen.add(part.id);doc=placeOutput(doc,part,assets);}
  }else if(item.op==='layout.arrange')arrangeCreationNodes(doc.page,item.targets.map(id=>requireNode(doc,id).id),item.rule,item.container);
  else if(item.op==='layout.matchRotation'){
   const reference=requireNode(doc,item.reference),targetIds=item.targets.map(id=>requireNode(doc,id).id);
   if(new Set(targetIds).size!==targetIds.length)throw Error('角度对齐对象不能重复');
   if(targetIds.includes(reference.id))throw Error('角度参照不能被同时旋转');
   const paths=targetIds.map(id=>spatialPath(doc.page.layers,id));
   if(paths.some(path=>path.ancestors.some(node=>targetIds.includes(node.id))))throw Error('不能同时旋转组合及其子节点');
   if(paths.some(path=>spatialPath(doc.page.layers,reference.id).ancestors.some(node=>node.id===path.node.id)))throw Error('不能用待旋转组合的子节点作角度参照');
   const rotation=worldBox(doc.page,reference.id).rotation+(item.offsetDeg||0);
   for(const id of targetIds){const box=worldBox(doc.page,id);detachSceneLayout(doc.page,id,'place');setWorldPosition(doc.page,id,{x:box.cx,y:box.cy,rotation});}
  }else if(item.op==='layout.alignEdge'){
   const target=requireNode(doc,item.target),reference=requireNode(doc,item.reference);
   if(target.id===reference.id)throw Error('不能以自身作为可见边参照');
   if(surfaceOf(doc,target.id)!==surfaceOf(doc,reference.id))throw Error('可见边对齐要求对象在同一工作空间');
   if(spatialPath(doc.page.layers,reference.id).ancestors.some(node=>node.id===target.id))throw Error('不能以待移动组合的子节点为边缘参照');
   const placement=edgeAlignment(doc.page,{...item,target:target.id,reference:reference.id},doc.source,options.edgeQuads);
   detachSceneLayout(doc.page,target.id,'place');setWorldPosition(doc.page,target.id,placement);
  }else if(item.op==='layout.nudge'){
   const targetIds=item.targets.map(id=>requireNode(doc,id).id);
   if(new Set(targetIds).size!==targetIds.length)throw Error('微调对象不能重复');
   if(targetIds.some(id=>spatialPath(doc.page.layers,id).ancestors.some(node=>targetIds.includes(node.id))))throw Error('不能同时微调组合及其子节点');
   const [dx,dy]=(item.deltaMm||[0,0]).map(value=>value*s);
   for(const id of targetIds){const box=worldBox(doc.page,id);detachSceneLayout(doc.page,id,'place');setWorldPosition(doc.page,id,{x:box.cx+dx,y:box.cy+dy,rotation:box.rotation+(item.rotationDeg||0)});}
  }
  else if(item.op==='layout.detach')detachSceneLayout(doc.page,requireNode(doc,item.target).id,item.scope||'all');
  else if(item.op==='layer.split'){
   const node=requireNode(doc,item.target),width=node.width/s,height=node.height/s;
   if(node.type!=='material'&&!(node.type==='shape'&&node.kind==='paper'))throw Error('layer.split 支持实体素材与数字纸');
   if(item.pieces[0].id===item.pieces[1].id)throw Error('裁片 id 不能重复');
   const geometry=splitLineGeometry(item.split,width,height);
   if(node.type==='material'){
    const asset=assets.find(row=>row.id===node.assetID),crop=node.cropRect||{x:0,y:0,width:1,height:1},source=itemSourceGeometry(node,asset);
    const regions=geometry.map((g,i)=>({id:item.pieces[i].id,geometry:geometryIntersection(source,transformGeometry(g,p=>[crop.x*asset.physicalWidthMM+p[0]/width*crop.width*asset.physicalWidthMM,crop.y*asset.physicalHeightMM+p[1]/height*crop.height*asset.physicalHeightMM]))}));
    doc=physicalCut(doc,{target:item.target,regions,keepRemainders:false},assets,input.transactionId,index);
    for(const part of item.pieces)doc=placeOutput(doc,part,assets);
   }else doc=splitDigitalPaper(doc,item,geometry,assets);
  }else if(item.op==='layer.cut'){
   const node=requireNode(doc,item.target);
   if(node.type==='material')doc=applyCreationV2Batch(doc,{...input,operations:[{...item,op:'material.cut'}]},assets,options);
   else if(node.type==='shape'&&node.kind==='paper'){
    const width=node.width/s,height=node.height/s,region=creationRegionGeometry(item.region,{sourceSize:[width,height],localSize:[width,height],crop:{x:0,y:0,width:1,height:1}}),source=paperGeometry(node,width,height);
    const result=item.mode==='keep'?geometryIntersection(source,region):geometryDifference(source,region);
    if(geometryArea(result)<1e-6)throw Error('裁切结果为空');
    doc=patch(doc,node.id,{vectorMask:paperMask(result,width,height)},assets);
    if(node.creationObject)setCreationObject(doc,node.id,{...node.creationObject,cutMask:paperMask(result,width,height)});
   }else throw Error('layer.cut 支持实体素材与数字纸');
  }
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
  }else if(item.op==='material.tear'){
   const node=requireNode(doc,item.target);if(node.type!=='material'||node.tapeStrip)throw Error('material.tear 需要普通实体素材');
   if(node.craftWindowIDs?.length)throw Error('命名开窗素材请先完成穿插或恢复，再进行撕纸');
   const asset=assets.find(row=>row.id===node.assetID),crop=node.cropRect||{x:0,y:0,width:1,height:1};
   const local=tearRegionGeometry(item.path,{width:crop.width*asset.physicalWidthMM,height:crop.height*asset.physicalHeightMM,keep:item.keep,depthMm:item.depthMm,periodMm:item.periodMm,seed:item.seed});
   const region=transformGeometry(local,p=>[crop.x*asset.physicalWidthMM+p[0],crop.y*asset.physicalHeightMM+p[1]]);
   const source=itemSourceGeometry(node,asset),result=geometryIntersection(source,region),remaining=geometryDifference(source,result);
   if(geometryArea(result)<=1e-6||geometryArea(remaining)<=1e-6)throw Error('撕纸轨迹没有将当前素材分开');
   const bounds=geometryBounds(result);if(Math.min(bounds.width,bounds.height)<2-1e-7)throw Error('实体裁片短边不能小于 2 mm');
   doc=physicalCut(doc,{target:item.target,regions:[{id:item.resultId,geometry:result}],keepRemainders:item.keepRemainder!==false},assets,input.transactionId,index);
  }else if(item.op==='material.split'){
   let split=item;
   if(item.asset){
    // One author-facing operation, the same source allocation and cut kernel.
    // The temporary stock node never survives a successful atomic operation.
    const target='split-stock-'+craftDigest([input.transactionId,index,item.asset]).slice(7,31);
    doc=addMaterialNode(doc,{id:target,asset:item.asset,place:{reference:'page',at:[.5,.5],unit:'ratio',surface:'tray'}},assets);
    split={...item,target};
   }
   doc=splitPhysicalPiece(doc,split,assets,input.transactionId,index);
  }
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
   const named=[...namedSourceHoles(node,asset),{id:item.windowId,geometry:opening}];
   if(item.keepRemainder||item.cutoutId||item.resultId&&item.resultId!==item.target){
    const source=itemSourceGeometry(node,asset),main=geometryDifference(source,opening),cutout=geometryIntersection(source,opening),resultId=item.resultId&&item.resultId!==item.target?item.resultId:item.target+'-window-'+craftDigest([input.transactionId,index]).slice(7,15),pieces=[{id:resultId,geometry:main}];
    if(item.keepRemainder||item.cutoutId)pieces.push({id:item.cutoutId||item.windowId+'-cutout',geometry:cutout});
    doc=physicalCut(doc,{target:item.target,regions:pieces,keepRemainders:item.keepRemainder!==false},assets,input.transactionId,index);
    const metadataBefore=attachSceneV2(structuredClone(doc.page));assignWindowIDs(requireNode(doc,resultId),asset,named);recordManagedChanges(metadataBefore,attachSceneV2(doc.page));
    if(item.edge&&item.edge.style!=='clean')doc=processMaterial(doc,resultId,[edgeStep(requireNode(doc,resultId),asset,item.edge)],assets);
   }else{
    const metadataBefore=attachSceneV2(structuredClone(doc.page));delete node.craftWindowIDs;recordManagedChanges(metadataBefore,attachSceneV2(doc.page));
    const steps=[{op:'cut_shape',shape:'geometry',mode:'remove',unit:'ratio',geometry:displayMaskGeometry(node,asset,item.region,doc.page)}];
    if(item.edge&&item.edge.style!=='clean')steps.push(edgeStep(node,asset,item.edge));doc=processMaterial(doc,item.target,steps,assets);
    const updated=requireNode(doc,item.target);assignWindowIDs(updated,asset,named);
   }
  }else if(item.op==='material.weave'){
   if(requireNode(doc,item.strip).type!=='material')throw Error('穿插纸条必须是实体素材');
   const through=item.through.map(entry=>{const target=requireNode(doc,entry.target);if(target.type!=='material')throw Error('穿插目标必须是实体素材');const hole=target.craftWindowIDs?.indexOf(entry.window)??-1;if(hole<0)throw Error('穿插引用的开窗不存在');return {target:target.creativePieceID||target.id,hole,sideAfter:entry.sideAfter};});
   applySceneWeave(doc.page,requireNode(doc,item.strip).id,through.map(entry=>({...entry,target:requireNode(doc,entry.target).id})),{policy:AI_SCENE_POLICY});
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
 }catch(error){throw Object.assign(Error('operations['+index+'] '+rawItem.op+': '+error.message),{code:error.code||'OPERATION_FAILED',operationIndex:index,path:error.path});}
 return doc;
}
function edgeStep(node,asset,edge){
 const crop=node.cropRect||{width:1,height:1},side=Math.min(crop.width*asset.physicalWidthMM,crop.height*asset.physicalHeightMM);
 return {op:'edge',style:edge.style,edges:edge.edges||['top','right','bottom','left'],depth_mm:edge.depthMm??Math.max(.1,Math.min(side*.08,(edge.roughness??.2)*3)),period_mm:edge.periodMm??Math.max(.5,side*.16),...(edge.seed===undefined?{}:{seed:edge.seed}),...(edge.position===undefined?{}:{position:edge.position})};
}

function paperGeometry(node,width,height){
 const mask=node.vectorMask;
 return mask?transformGeometry(normalizeGeometry([[mask.outer,...mask.holes||[]]]),p=>[p[0]*width,p[1]*height]):rectangleGeometry(0,0,width,height);
}
function applyPaperEdge(doc,id,edge,assets){
 const node=requireNode(doc,id);
 if(edge.style==='clean')return patch(doc,id,{vectorMask:node.creationObject?.cutMask||null},assets);
 const s=scale(doc.page),w=node.width/s,h=node.height/s,cutMask=node.creationObject?.cutMask;
 const base=cutMask?paperGeometry({vectorMask:cutMask},w,h):rectangleGeometry(0,0,w,h);
 const operation=edgeStep(node,{physicalWidthMM:w,physicalHeightMM:h},edge);
 const contour=buildCraftEdge(operation,w,h);
 const geometry=transformGeometry(normalizeGeometry([[contour.points]]),p=>[p[0]*w,p[1]*h]);
 return patch(doc,id,{vectorMask:paperMask(geometryIntersection(base,geometry),w,h)},assets);
}

function updateSemanticObject(doc,item,assets,input,options){
 const node=requireNode(doc,item.target),kind=node.creationObject.kind;
 const {op,target,place,order,hidden,locked,name,...changes}=item;
 if(!Object.keys(changes).length)return finishNode(doc,target,expandCreationUpdate(doc.page,target,item),assets);
 const parameters=mergeObjectPatch(node.creationObject.parameters,changes);
 if(kind==='paper'&&parameters.edge)parameters.edge={style:'clean',seed:42,...parameters.edge};
 validateCreationV2Commands({...input,operations:[{op:kind+'.add',id:target,...parameters}]});
 if(kind==='paper'){
  const unsupported=['content','effect','accentColor','layout','curveHeightMm','backdrop','runs','gapMm'];
  if(unsupported.some(key=>key in changes))throw Error('数字纸不接受标题字段');
  const compiled=compilePaperObject({id:target,...parameters});
  const update={op:'layer.update',target,...(item.size?{size:item.size}:{}),geometry:compiled.geometry,...(item.style||item.pattern!==undefined?{style:compiled.style}:{}),...(place?{place}:{}),...(order?{order}:{})};
  doc=finishNode(doc,target,expandCreationUpdate(doc.page,target,update),assets);
  if(item.edge)doc=applyPaperEdge(doc,target,parameters.edge,assets);
 }else{
  if(['texture','edge','pattern','translucency','rows','columns','geometry'].some(key=>key in changes))throw Error('标题不接受纸张或图形字段');
  // A changed sentence cannot silently reuse runs spelling a different sentence.
  if(parameters.runs&&parameters.runs.map(run=>run.content).join('')!==parameters.content)throw Error('修改 content 时请同时更新 runs，或 runs:null 清除词组布局');
  const previousWorld=worldBox(doc.page,node.id),compiled=compileTitleOperations({titles:[{id:target,...parameters}]})[0],oldChildren=node.children.map(child=>child.id);
  for(const child of allNodes(node.children)){
   assertSceneEditable(doc.page,child.id);assertPolicyOwnership(child,AI_SCENE_POLICY);assertNoLinkedDependents(doc.page,child.id);
  }
  for(const id of oldChildren)doc=editScene(doc,[{op:'delete',id}],assets);
  doc=patch(doc,target,{layoutBox:{width:compiled.layoutBox.width*scale(doc.page),height:compiled.layoutBox.height*scale(doc.page)}},assets);
  doc=applyCreationV2Batch(doc,{...input,transactionId:input.transactionId+'-title',operations:compiled.children.map(child=>({...child,parent:target}))},assets,options);
  const beforePosition=attachSceneV2(structuredClone(doc.page));
  setWorldPosition(doc.page,target,{x:previousWorld.cx,y:previousWorld.cy,rotation:previousWorld.rotation});
  recordManagedChanges(beforePosition,attachSceneV2(doc.page));
  doc=finishNode(doc,target,expandCreationUpdate(doc.page,target,{target,...(place?{place}:{}),...(order?{order}:{})}),assets);
 }
 setCreationObject(doc,target,{...requireNode(doc,target).creationObject,kind,parameters});
 return finishNode(doc,target,{...(hidden!==undefined?{hidden}:{}),...(locked!==undefined?{locked}:{}),...(name!==undefined?{name}:{})},assets);
}
function splitDigitalPaper(doc,item,geometries,assets){
 const node=requireNode(doc,item.target),s=scale(doc.page),width=node.width/s,height=node.height/s,source=paperGeometry(node,width,height),original=structuredClone(doc),parent=locate(doc.page.layers,node.id).parent;
 assertNoLinkedDependents(doc.page,node.id);
 const copies=item.pieces.map((part,i)=>{
  if(find(doc,part.id))throw Error('裁片 id 已存在：'+part.id);
  const result=geometryIntersection(source,geometries[i]);
  if(geometryArea(result)<1e-6)throw Error('分割线未将纸张分为两片');
  const copy=structuredClone(node);copy.id=part.id;copy.agentKey=part.id;delete copy.aiManaged;delete copy.layoutConstraint;
  copy.vectorMask=paperMask(result,width,height);
  if(copy.creationObject)copy.creationObject.cutMask=structuredClone(copy.vectorMask);
  return copy;
 });
 doc=editScene(doc,[{op:'delete',id:node.id}],assets);
 for(const copy of copies)doc=insertSceneNode(doc,copy,assets,parent?.id);
 preserveReplacementStack(original,item.target,doc,copies.map(n=>n.id));
 for(const part of item.pieces)doc=placeOutput(doc,part,assets);
 return doc;
}

function setCreationObject(doc,id,value){
 const before=attachSceneV2(structuredClone(doc.page));
 requireNode(doc,id).creationObject=value;
 recordManagedChanges(before,attachSceneV2(doc.page));
}

function paperMask(geometry,width,height){
 const {outer,holes}=geometryToMask(geometry,width,height);
 if([outer,...holes].some(ring=>ring.length>256))throw Error('纸张轮廓过密；请增大 edge.periodMm 后重试，或减少重复裁切');
 return {outer,holes};
}

function placeOutput(doc,part,assets){
 if(part.place&&!part.place.surface&&part.place.reference?.startsWith('page'))part={...part,place:{...part.place,surface:'page'}};
 const parent=locate(doc.page.layers,part.id)?.parent;
 if(parent&&part.place?.surface&&part.place.surface!==surfaceOf(doc,parent.id))doc=editScene(doc,[{op:'move',id:requireNode(doc,part.id).id,parent:null}],assets);
 return finishNode(doc,part.id,part,assets);
}

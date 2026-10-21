// Specialized capabilities still use the same public properties and Scene.
import {creationNode,creationNodes,creationLocation,sceneScale,editScene,insertSceneNode,patchSceneNode} from './creation-scene-core.js';
import {dimension,changedNodeProperties} from './creation-node-update.js';
import {measureSceneText} from './scene-text-layout.js';
import {creationReferenceBox,resolveCreationPlace} from './creation-placement.js';
import {geometryToMask} from './craft-region-ops.js';
import {creationRegionGeometry} from './creation-region.js';
import {normalizeGeometry,rectangleGeometry,geometryDifference,geometryIntersection,geometryBounds,transformGeometry} from './craft-topology.js';
import {worldBox,setWorldPosition,spatialPath,inverseMatrix,transformPoint,rigidMatrix} from './scene-spatial.js';
import {assertSceneEditable,attachSceneV2} from './scene-v2.js';
import {solveCraftRelations} from './craft-relations.js';
import {itemFromAsset} from './domain.js';

export function applyCreationAdvanced(doc,item,assets,context){
 const {finishNode,processMaterial,assetFor}=context,s=sceneScale(doc.page);
 const target=item.target?creationNode(doc,item.target):null;
 if(item.op==='text.fit'){
  if(target.type!=='text')throw Error('text.fit 需要文字');
  const parent=creationLocation(doc.page.layers,target.id)?.parent?.id;
  const w=dimension(doc.page,item.size,'width',parent),h=dimension(doc.page,item.size,'height',parent),{minFontSizePt:min,maxFontSizePt:max}=item.fit;
  if(min>max)throw Error('最小字号不能大于最大字号');
  const fits=pt=>{try{
   const candidate={...target,...changedNodeProperties(doc.page,target,{size:{width:w,unit:'mm'},style:{fontSizePt:pt}},parent)};
   const metrics=measureSceneText(candidate);return metrics.height<=h*s+1e-7&&metrics.width<=w*s+1e-7;
  }catch(error){if(/曲线文字超出/.test(error.message))return false;throw error;}};
  if(!fits(min))throw Error('在最小字号下仍放不下全部文字；请扩大区域，不截字');
  let lo=min,hi=max;for(let k=0;k<24;k++){const mid=(lo+hi)/2;if(fits(mid))lo=mid;else hi=mid;}
  const pt=fits(max)?max:Math.max(min,Math.floor(lo*10000)/10000);
  return finishNode(doc,item.target,{size:{width:w,height:h,unit:'mm'},style:{fontSizePt:pt},place:item.place,order:item.order},assets);
 }
 if(item.op==='material.contour'){
  if(target.type!=='material'||target.tapeStrip)throw Error('轮廓加工需要普通实体素材');
  return processMaterial(doc,item.target,[{op:'mask',shape:item.shape,...(item.radiusRatio===undefined?{}:{radius:item.radiusRatio}),...(item.depthRatio===undefined?{}:{depth:item.depthRatio}),...(item.waves===undefined?{}:{waves:item.waves})}],assets);
 }
 if(item.op==='material.trim')return processMaterial(doc,item.target,[{op:'trim',edge:item.edge,quantity:item.quantity}],assets);
 if(item.op==='material.diagonal'){
  if(target.type!=='material'||target.tapeStrip)throw Error('斜裁需要普通实体素材');
  const line=item.line,convert=point=>line.unit==='ratio'?point:[point[0]*s/target.width,point[1]*s/target.height];
  return processMaterial(doc,item.target,[{op:'diagonal',from:convert(line.from),to:convert(line.to),keep:item.keep}],assets);
 }
 if(item.op==='material.restore'){
  if(target.type!=='material'||target.tapeStrip)throw Error('恢复需要普通实体素材');
  // Window names describe derived geometry and cannot survive its removal.
  delete target.craftWindowIDs;delete target.craftDisplaySlices;delete target.vectorMask;
  return processMaterial(doc,item.target,[{op:'whole'}],assets,'replace');
 }
 if(item.op==='material.replace'){
  const asset=assetFor(doc,assets,item.asset);
  // source-dependent window identities are invalid after replacement.
  delete target.craftWindowIDs;
  doc=editScene(doc,[{op:'replace-material',id:target.id,assetID:asset.id}],assets);
  return finishNode(doc,item.target,item,assets);
 }
 if(item.op==='layer.mask'){
  if(target.type==='material')throw Error('素材显示遮罩请使用 material.mask');
  if(target.type==='ink')throw Error('请将笔迹编组后设置组合遮罩');
  if(item.region.space!=='local')throw Error('数字节点遮罩使用 local 坐标');
  const box=worldBox(doc.page,target.id),region=creationRegionGeometry(item.region,{sourceSize:[box.w/s,box.h/s],localSize:[box.w/s,box.h/s],crop:{x:0,y:0,width:1,height:1},output:'localRatio'});
  const old=target.vectorMask?normalizeGeometry([[target.vectorMask.outer,...(target.vectorMask.holes||[])]]):rectangleGeometry(0,0,1,1);
  const shape=item.mode==='subtract'?geometryDifference(old,region):item.mode==='intersect'?geometryIntersection(old,region):region;
  const {outer,holes}=geometryToMask(shape,1,1);return patchSceneNode(doc,item.target,{vectorMask:{outer,holes}},assets);
 }
 if(item.op==='material.glyphKnockout'){
  if(target.type!=='material'||target.tapeStrip)throw Error('字形镂空需要普通实体素材');
  const asset=assets.find(a=>a.id===target.assetID),box=worldBox(doc.page,target.id),crop=target.cropRect||{x:0,y:0,width:1,height:1};
  let region=item.region;
  if(item.text){
   if(typeof context.glyphOutline!=='function')throw Object.assign(Error('文字镂空需要本机字体解析器，或提供 region 轮廓；离线 CLI 已提供解析器'),{code:'FONT_RESOLVER_UNAVAILABLE'});
   const geometry=context.glyphOutline(item.text,item.style),bounds=geometryBounds(geometry),parent=creationLocation(doc.page.layers,target.id)?.parent?.id;
   const position=resolveCreationPlace(doc.page,item.place,{widthMm:bounds.width,heightMm:bounds.height,parentID:parent});
   const inverse=inverseMatrix(rigidMatrix(box.cx,box.cy,box.rotation)),a=position.rotation*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);
   const local=transformGeometry(geometry,([x,y])=>{const dx=(x-bounds.x-bounds.width/2)*s,dy=(y-bounds.y-bounds.height/2)*s,p=transformPoint(inverse,position.x+dx*c-dy*sn,position.y+dx*sn+dy*c);return [(p.x+box.w/2)/s,(p.y+box.h/2)/s];});
   region={shape:'geometry',space:'local',unit:'mm',geometry:local};
  }
  const geometry=creationRegionGeometry(region,{sourceSize:[asset.physicalWidthMM,asset.physicalHeightMM],localSize:[box.w/s,box.h/s],crop,output:'localRatio'});
  if(target.craftWindowIDs?.length)throw Error('命名开窗素材请先完成穿插设计；字形镂空会改变孔洞编号');
  return processMaterial(doc,item.target,[{op:'cut_shape',shape:'geometry',mode:'remove',unit:'ratio',geometry}],assets);
 }
 if(item.op==='material.relate'){
  if(target.type!=='material')throw Error('实体关系需要素材');
  const r=item.relation,resolve=ref=>{if(!ref.startsWith('node:'))throw Error('实体关系必须引用 node:<id>');const n=creationNode(doc,ref.slice(5));if(n.type!=='material')throw Error('关系参照必须是素材');return n;};
  const ref=resolve(r.reference),other=r.reference2?resolve(r.reference2):null;
  const parent=creationLocation(doc.page.layers,target.id)?.parent?.id||null;
  if([ref,other].filter(Boolean).some(n=>(creationLocation(doc.page.layers,n.id)?.parent?.id||null)!==parent))throw Error('实体前后关系需要同级对象');
  let offset=r.offset?.value||[0,0];
  if(r.offset?.unit==='ratio')offset=[offset[0]*ref.width/s,offset[1]*ref.height/s];
  if(r.offset?.space&&r.offset.space!=='reference')throw Error('垫底偏移使用 reference 空间');
  const relation={kind:r.kind,target:ref.creativePieceID||ref.id,...(other?{target2:other.creativePieceID||other.id}:{}),...(r.edge?{edge:r.edge}:{}),...(r.exposedMm===undefined?{}:{exposed_mm:r.exposedMm}),along_mm:r.alongMm||0,rotation_offset:r.rotationDeg||0,offset_mm:offset,...(r.from?{anchor_from:r.from}:{}),...(r.to?{anchor_to:r.to}:{}),...(r.contactMm===undefined?{}:{contact_mm:r.contactMm})};
  const objects=[target,ref,other].filter(Boolean).map(n=>{const b=worldBox(doc.page,n.id);return {...n,x:b.cx,y:b.cy,rotation:b.rotation};});
  const result=solveCraftRelations(objects,[{piece:target.creativePieceID||target.id,relation}],s).get(target.creativePieceID||target.id);
  delete target.layoutConstraint;setWorldPosition(doc.page,target.id,result);target.materialRelation=relation;
  return finishNode(doc,target.id,{order:r.kind==='bridge'?{after:(other?.zIndex||0)>(ref.zIndex||0)?other.id:ref.id}:{before:ref.id}},assets);
 }
 if(item.op==='layer.repeat'){
  if(target.type!=='shape')throw Error('重复盖印只接受数字图形，不复制实体素材');
  const snapshot=structuredClone(target);
  for(const copy of item.copies){
   const node=structuredClone(snapshot);node.id=copy.id;node.agentKey=copy.id;
   for(const key of ['key','aiManaged','layoutConstraint'])delete node[key];
   doc=insertSceneNode(doc,node,assets);
   if(copy.parent){const parent=creationNode(doc,copy.parent);if(parent.type!=='group')throw Error('父级必须是组合');doc=editScene(doc,[{op:'move',id:node.id,parent:parent.id}],assets);}
   doc=finishNode(doc,node.id,copy,assets,{created:true});
  }
  return doc;
 }
 if(item.op==='layout.reuse'){
  if(target.type!=='group')throw Error('layout.reuse 引用一个现有组合；外部模板请使用 group.compose 的统一子命令');
  const source=structuredClone(target),nodes=creationNodes([source]),ids=new Map(),aliases=new Map(doc.source.materials.map(row=>[row.assetID,row.alias]));
  for(const n of nodes){assertSceneEditable(attachSceneV2(doc.page),n.id);const newID=n.id===target.id?item.id:item.id+'-'+(n.creativePieceID||n.agentKey||n.key||n.id);if(newID.length>128)throw Error('复用后编号过长，请缩短组合编号');for(const key of [n.id,n.key,n.agentKey,n.creativePieceID].filter(Boolean))ids.set(key,newID);}
  for(const n of nodes){
   const originalID=n.id;n.id=ids.get(n.id);delete n.aiManaged;delete n.key;delete n.agentKey;
   if(n.type==='material'){
    const mapped=item.materialMap?.[aliases.get(n.assetID)];if(!mapped)throw Error('实体复用必须显式 materialMap：'+aliases.get(n.assetID));
    const asset=assetFor(doc,assets,mapped),fresh=itemFromAsset(asset,doc.page,n.x,n.y,n.zIndex);fresh.rotation=n.rotation||0;
    const identity={id:n.id,type:'material',creativePieceID:n.id};Object.keys(n).forEach(key=>delete n[key]);Object.assign(n,fresh,identity);
    n.generationBaseline={...n.generationBaseline,rotation:n.rotation};
   }else{
    n.agentKey=n.id;if(n.type==='group')n.name=originalID===target.id?item.id:n.name;
    if(n.layoutConstraint?.place?.reference?.startsWith('node:')){const old=n.layoutConstraint.place.reference.slice(5);if(ids.has(old))n.layoutConstraint.place.reference='node:'+ids.get(old);}
    if(n.type==='text')Object.assign(n,changedNodeProperties(doc.page,n,{}));
   }
  }
  doc=insertSceneNode(doc,source,assets,item.parent);return finishNode(doc,source.id,item,assets,{created:true});
 }
 if(item.op==='layout.align'){
  alignNodes(doc,item);return doc;
 }
 throw Error('未实现的命令：'+item.op);
}
function alignNodes(doc,item){
 const ids=item.targets.map(id=>creationNode(doc,id).id);if(new Set(ids).size!==ids.length)throw Error('对齐对象不能重复');
 const paths=ids.map(id=>spatialPath(doc.page.layers,id)),parent=paths[0].ancestors.at(-1)?.id||null;
 if(paths.some(path=>(path.ancestors.at(-1)?.id||null)!==parent))throw Error('对齐需要同级节点');
 const boxes=ids.map(id=>worldBox(doc.page,id)),axis=item.axis,ref=item.reference?creationReferenceBox(doc.page,item.reference,parent):null;
 if(item.reference?.startsWith('node:')&&ids.includes(item.reference.slice(5)))throw Error('对齐参照不能被同时移动');
 const angle=ref?.rotation||0,a=angle*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);
 const bounds=boxes.map(b=>{const r=(b.rotation-angle)*Math.PI/180;return {center:axis==='x'?c*b.cx+sn*b.cy:-sn*b.cx+c*b.cy,extent:(axis==='x'?Math.abs(Math.cos(r))*b.w+Math.abs(Math.sin(r))*b.h:Math.abs(Math.sin(r))*b.w+Math.abs(Math.cos(r))*b.h)/2};});
 const refCenter=ref?(axis==='x'?c*ref.cx+sn*ref.cy:-sn*ref.cx+c*ref.cy):0;
 const left=ref?refCenter-(axis==='x'?ref.w:ref.h)/2:Math.min(...bounds.map(b=>b.center-b.extent)),right=ref?refCenter+(axis==='x'?ref.w:ref.h)/2:Math.max(...bounds.map(b=>b.center+b.extent));
 let desired;
 if(item.align==='distribute'){
  const indices=ids.map((_,i)=>i).sort((a,b)=>bounds[a].center-bounds[b].center),gap=(right-left-bounds.reduce((sum,b)=>sum+2*b.extent,0))/(ids.length-1);
  if(gap<0)throw Error('分布区域不足，不缩放实体素材');desired=[];let x=left;for(const i of indices){desired[i]=x+bounds[i].extent;x+=2*bounds[i].extent+gap;}
 }else desired=bounds.map(b=>item.align==='start'?left+b.extent:item.align==='end'?right-b.extent:(left+right)/2);
 for(const [i,b] of boxes.entries()){delete paths[i].node.layoutConstraint;const delta=desired[i]-bounds[i].center;setWorldPosition(doc.page,ids[i],{x:b.cx+(axis==='x'?c:-sn)*delta,y:b.cy+(axis==='x'?sn:c)*delta,rotation:b.rotation});}
}

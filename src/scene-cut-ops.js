import {attachSceneV2,findSceneNode,validateVectorMask} from './scene-v2.js';
import {itemSourceGeometry,geometryMaterialRecipe} from './craft-region-ops.js';
import {normalizeGeometry,rectangleGeometry,geometryArea,geometryBounds,
  geometryIntersection,geometryDifference,geometryUnion,transformGeometry,AREA_EPSILON} from './craft-topology.js';
import {shapePaths} from './editor-tools-model.js';
import {cutFaces} from './planar-cut.js';
import {materialMaskGeometry} from './material-mask.js';

const square=rectangleGeometry(0,0,1,1);
const point=p=>Array.isArray(p)?p:[p.x,p.y];
const finite=p=>p.length===2&&p.every(Number.isFinite);
const clamp=v=>Math.max(0,Math.min(1,v));
const openRing=ring=>ring.length>3&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<1e-7?
  ring.slice(0,-1):ring;
const polygon=mask=>mask?normalizeGeometry([[mask.outer,...mask.holes||[]]]):square;
const maskFromGeometry=g=>{
  if(g.length!==1)throw Error('局部显示不能产生多个分离区域；请改用分割');
  const mask={outer:openRing(g[0][0]).map(p=>p.map(clamp)),
    holes:g[0].slice(1).map(r=>openRing(r).map(p=>p.map(clamp)))};
  return validateVectorMask(mask);
};
const samePoint=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7;

export function scenePointToLocal(node,p){
  const [x,y]=point(p),rad=(node.rotation||0)*Math.PI/180,
    dx=x-node.x,dy=y-node.y,c=Math.cos(rad),s=Math.sin(rad);
  return [.5+(dx*c+dy*s)/node.width,.5+(-dx*s+dy*c)/node.height];
}
export function localPointToScene(node,p){
  const [x,y]=point(p),rad=(node.rotation||0)*Math.PI/180,
    dx=(x-.5)*node.width,dy=(y-.5)*node.height,c=Math.cos(rad),s=Math.sin(rad);
  return [node.x+dx*c-dy*s,node.y+dx*s+dy*c];
}
// Kept as a public helper for callers that only have a rectangular object.
// The same arrangement engine also handles self intersections and closed loops.
export function freeLinePartitions(localPoints){
  if(!Array.isArray(localPoints)||localPoints.length<2||localPoints.length>256||
    !localPoints.every(finite))throw Error('请画一条有效的自由切线');
  return cutFaces(square,localPoints).filter(region=>
    geometryArea(region)>=1e-5&&geometryArea(region)<1-1e-5);
}
export const freeLinePartition=localPoints=>freeLinePartitions(localPoints)[0]||null;
function presetRegion(preset,inset=.18){
  const v=Math.max(.025,Math.min(.45,Number(inset)||.18));
  if(preset==='window')return rectangleGeometry(v,v,1-2*v,1-2*v);
  if(preset==='ellipse')return normalizeGeometry([[Array.from({length:65},(_,i)=>{
    const a=i*Math.PI*2/64;return [.5+(.5-v)*Math.cos(a),.5+(.5-v)*Math.sin(a)];})]]);
  if(preset==='edge')return rectangleGeometry(0,0,v,1);
  if(preset==='ring')return rectangleGeometry(v,v,1-2*v,1-2*v);
  throw Error('未知的裁切预设');
}
export function sourceOutline(node,asset,override=null){
  if(node.type==='material'){
    const crop=node.cropRect||{x:0,y:0,width:1,height:1};
    const silhouette=asset?.sourceSilhouette;
    const local=silhouette?.length?geometryIntersection(transformGeometry(silhouette,p=>
      [(p[0]-crop.x)/crop.width,(p[1]-crop.y)/crop.height]),square):square;
    const material=materialMaskGeometry(node.materialMask);
    return material?geometryIntersection(local,[[material.outer,...material.holes]]):local;
  }
  if(node.type==='shape'){
    if(override?.length)return override;
    const paths=Array.isArray(node.vectorPaths)?node.vectorPaths:shapePaths(node.kind);
    if(paths?.length){
      const polygons=paths.filter(path=>Array.isArray(path)&&path.length>=3)
        .map(path=>normalizeGeometry([[path]]));
      if(polygons.length)return geometryUnion(...polygons);
    }
    if(node.kind==='ellipse')return normalizeGeometry([[Array.from({length:97},(_,i)=>{
      const angle=i*Math.PI*2/96;return [.5+.48*Math.cos(angle),.5+.48*Math.sin(angle)];})]]);
  }
  return square;
}
function regionFor(node,spec,asset){
  if(spec.preset)return [presetRegion(spec.preset,spec.inset)];
  const local=(spec.points||[]).map(p=>scenePointToLocal(node,p));
  if(local.length<2)return [];
  const outline=sourceOutline(node,asset,spec.shapeOutlines?.[node.id]);
  if(!outline.length)return [];
  const path=spec.pathType==='loop'&&local.length>=3&&
    !samePoint(local[0],local.at(-1))?[...local,local[0]]:local;
  return cutFaces(outline,path).map(face=>geometryIntersection(face,square))
    .filter(face=>geometryArea(face)>1e-5);
}
function findLocation(nodes,id,parent=null){
  for(let index=0;index<nodes.length;index++){
    const node=nodes[index];if(node.id===id)return {nodes,index,node,parent};
    if(node.type==='group'){
      const found=findLocation(node.children||[],id,node);if(found)return found;
    }
  }
  return null;
}
function candidates(draft,spec){
  const selected=spec.scope==='object'?findSceneNode(draft,spec.selectedID):null;
  if(spec.scope==='object'&&!selected)throw Error('请先选择要剪切的对象');
  const targets=Array.isArray(spec.targetIDs)?new Set(spec.targetIDs):null;
  if(spec.scope==='all'&&targets&&!targets.size)throw Error('请在剪刀面板中勾选要剪切的图层');
  const out=[];
  const walk=(nodes,active=false,blocked=false,included=false)=>{
    for(const node of nodes){
      const skip=blocked||node.hidden||node.isHidden||node.isParked||node.locked||node.isLocked;
      const target=active||node.id===selected?.id;
      const allowed=included||targets?.has(node.id);
      if(node.type==='group'){walk(node.children||[],target,skip,allowed);continue;}
      if(skip||spec.scope==='object'&&!target)continue;
      if(spec.scope==='all'&&targets&&!allowed)continue;
      if(['material','shape','text'].includes(node.type))out.push(node);
      else if(spec.operation==='split'&&node.type==='ink')out.push(node);
    }
  };
  walk(draft.layers);
  return out;
}
function partitionGeometry(current,regions,epsilon){
  let parts=[current];
  for(const region of regions){
    parts=parts.flatMap(part=>[geometryIntersection(part,region),geometryDifference(part,region)]
      .flatMap(g=>g.map(poly=>[poly])).filter(g=>geometryArea(g)>epsilon));
    if(parts.length>128)throw Error('一次剪切产生太多裁片，请缩短路径');
  }
  return parts;
}
function pieceOutline(node,geometry){
  const ring=geometry[0]?.[0]||[];
  return openRing(ring).map(p=>localPointToScene(node,p));
}
function materialParts(node,regions,asset){
  if(!(asset?.physicalWidthMM>0&&asset?.physicalHeightMM>0))throw Error('素材缺少真实尺寸');
  const crop=node.cropRect||{x:0,y:0,width:1,height:1};
  const map=p=>[(crop.x+p[0]*crop.width)*asset.physicalWidthMM,
    (crop.y+p[1]*crop.height)*asset.physicalHeightMM];
  const source=itemSourceGeometry(node,asset);
  const alpha=asset.sourceSilhouette?.length?transformGeometry(asset.sourceSilhouette,p=>
    [p[0]*asset.physicalWidthMM,p[1]*asset.physicalHeightMM]):null;
  const current=alpha?geometryIntersection(source,alpha):source;
  const cuts=regions.map(region=>transformGeometry(region,map));
  const pieces=partitionGeometry(current,cuts,AREA_EPSILON);
  if(pieces.length<2)return null;
  const area=pieces.reduce((sum,g)=>sum+geometryArea(g),0);
  if(Math.abs(area-geometryArea(current))>AREA_EPSILON)throw Error('裁片面积不守恒');
  const oldCenter=[(crop.x+crop.width/2)*asset.physicalWidthMM,
    (crop.y+crop.height/2)*asset.physicalHeightMM],
    sx=node.width/(crop.width*asset.physicalWidthMM),
    sy=node.height/(crop.height*asset.physicalHeightMM),
    rad=(node.rotation||0)*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  return pieces.map(g=>{
    const recipe=geometryMaterialRecipe(g,asset),box=recipe.box;
    const dx=(box.x+box.width/2-oldCenter[0])*sx,
      dy=(box.y+box.height/2-oldCenter[1])*sy;
    const next={...structuredClone(node),cropRect:recipe.crop,
      materialMask:recipe.mask,cropSteps:[recipe.crop],
      splitParentId:node.splitParentId||node.id,
      width:box.width*sx,height:box.height*sy,
      x:node.x+dx*c-dy*s,y:node.y+dx*s+dy*c};
    if(node.vectorMask){
      const oldLocal=transformGeometry(g,p=>[(p[0]/asset.physicalWidthMM-crop.x)/crop.width,
        (p[1]/asset.physicalHeightMM-crop.y)/crop.height]);
      const visible=geometryIntersection(oldLocal,polygon(node.vectorMask));
      if(geometryArea(visible)>1e-5){
        const childLocal=transformGeometry(visible,p=>[
          ((crop.x+p[0]*crop.width)-recipe.crop.x)/recipe.crop.width,
          ((crop.y+p[1]*crop.height)-recipe.crop.y)/recipe.crop.height]);
        next.vectorMask=maskFromGeometry(childLocal);
      }else{delete next.vectorMask;next.cutHiddenByMask=true;next.isParked=true;}
    }
    delete next.craftDisplaySlices;
    next.materialSteps=[{op:'crop',box:{unit:'ratio',mode:'keep',values:[
      recipe.crop.x,recipe.crop.y,recipe.crop.width,recipe.crop.height]}}];
    const local=transformGeometry(g,p=>[(p[0]/asset.physicalWidthMM-crop.x)/crop.width,
      (p[1]/asset.physicalHeightMM-crop.y)/crop.height]);
    return {next,outline:pieceOutline(node,local),
      hitGeometry:transformGeometry(local,p=>localPointToScene(node,p)),area:geometryArea(g)};
  });
}
function vectorParts(node,regions,outline){
  const current=outline||sourceOutline(node),pieces=partitionGeometry(current,regions,1e-5);
  if(pieces.length<2)return null;
  return pieces.map(g=>{
    const visible=node.vectorMask?geometryIntersection(g,polygon(node.vectorMask)):g;
    const next={...structuredClone(node),cutParentId:node.cutParentId||node.id};
    if(geometryArea(visible)>1e-5)next.vectorMask=maskFromGeometry(visible);
    else{delete next.vectorMask;next.cutHiddenByMask=true;next.isParked=true;}
    return {next,outline:pieceOutline(node,g),
    hitGeometry:transformGeometry(g,p=>localPointToScene(node,p)),area:geometryArea(g)};
  });
}
const intersect=(a,b,c,d)=>{
  [a,b,c,d]=[a,b,c,d].map(p=>Array.isArray(p)?{x:p[0],y:p[1]}:p);
  const r=[b.x-a.x,b.y-a.y],s=[d.x-c.x,d.y-c.y],cross=r[0]*s[1]-r[1]*s[0];
  if(Math.abs(cross)<1e-9)return null;
  const q=[c.x-a.x,c.y-a.y],t=(q[0]*s[1]-q[1]*s[0])/cross,
    u=(q[0]*r[1]-q[1]*r[0])/cross;
  return t>1e-6&&t<1-1e-6&&u>=0&&u<=1?t:null;
};
function inkParts(node,spec){
  if(spec.preset)return null;
  const path=spec.pathType==='loop'?[...(spec.points||[]),(spec.points||[])[0]]:
    spec.points||[],source=node.points||[];
  if(path.length<2||source.length<2)return null;
  const pieces=[],part=[structuredClone(source[0])];
  for(let i=1;i<source.length;i++){
    const a=source[i-1],b=source[i],cuts=[];
    for(let j=1;j<path.length;j++){
      const t=intersect(a,b,path[j-1],path[j]);if(t!==null)cuts.push(t);
    }
    cuts.sort((x,y)=>x-y);
    for(const t of cuts.filter((v,k,all)=>k===0||v-all[k-1]>1e-5)){
      const cross={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
        p:(a.p??1)+((b.p??1)-(a.p??1))*t};
      part.push(cross);if(part.length>=2)pieces.push([...part]);
      part.splice(0,part.length,cross);
    }
    part.push(structuredClone(b));
  }
  if(part.length>=2)pieces.push(part);
  if(pieces.length<2)return null;
  return pieces.map(points=>({next:{...structuredClone(node),points,
    cutParentId:node.cutParentId||node.id},outline:points.map(p=>[p.x,p.y]),area:points.length}));
}

// Pure trial. The caller validates the complete resulting Scene before one
// checkpoint and one save. No preview writes to the persistent document.
export function planSceneCut(draft,spec,assets,{uid=()=>crypto.randomUUID()}={}){
  if(!['split','mask'].includes(spec?.operation)||!['object','all'].includes(spec.scope))
    throw Error('剪切方式或作用范围无效');
  if(!spec.preset&&(!Array.isArray(spec.points)||spec.points.length>256||
    !spec.points.every(p=>p&&finite(point(p)))))throw Error('剪切路径坐标无效');
  if(spec.operation==='mask'&&spec.scope==='all')
    throw Error('局部显示请先选择一个对象；剪刀可以作用于所有图层');
  const trial=attachSceneV2(structuredClone(draft)),records=new Map((assets||[]).map(a=>[a.id,a]));
  if(spec.operation==='mask'){
    const selected=findSceneNode(trial,spec.selectedID);
    const containsInk=node=>node?.type==='ink'||node?.type==='group'&&
      (node.children||[]).some(containsInk);
    if(containsInk(selected))throw Error('笔迹不能直接设置局部显示；请先将笔迹转换为图形');
  }
  const pieces=[],affected=[];let selectionID=null;
  for(const original of candidates(trial,spec)){
    const loc=findLocation(trial.layers,original.id);if(!loc)continue;
    const regions=original.type==='ink'?[]:regionFor(original,spec,records.get(original.assetID))
      .filter(region=>geometryArea(region)>=1e-5);
    if(original.type!=='ink'&&!regions.length)continue;
    if(spec.operation==='mask'){
      if(original.type==='ink')throw Error('请先将笔迹组合，再在组上设置局部显示');
      const current=polygon(original.vectorMask),region=geometryUnion(...regions),next=spec.hideRegion?
        geometryDifference(current,region):geometryIntersection(current,region);
      if(geometryArea(next)<1e-5)throw Error('局部显示不能隐藏整个对象');
      const before=original.vectorMask?structuredClone(original.vectorMask):null;
      original.vectorMask=maskFromGeometry(next);
      original.vectorMaskHistory=[...(original.vectorMaskHistory||[]),
        {before,after:structuredClone(original.vectorMask),mode:spec.hideRegion?'hide':'show'}].slice(-32);
      affected.push(original.id);selectionID||=loc.parent?.cutSourceID?loc.parent.id:original.id;
      pieces.push({key:original.id+':mask',sourceID:original.id,
        outline:pieceOutline(original,next),area:geometryArea(next),type:original.type});
      continue;
    }
    const result=original.type==='material'?materialParts(original,regions,records.get(original.assetID)):
      original.type==='ink'?inkParts(original,spec):vectorParts(original,regions,
        original.type==='shape'?spec.shapeOutlines?.[original.id]:null);
    if(!result)continue;
    const group=uid(),nodes=result.map(({next,outline,hitGeometry,area},index)=>{
      const key=original.id+':'+index;
      next.id=uid();next.zIndex=(original.zIndex||0)+index*.0001;
      // A fragment is a new editable node. Reusing an AI semantic key makes
      // physical validation mistake two fragments for the same layer.
      for(const field of ['creativePieceID','agentKey','key','aiManaged',
        'craftProvenance','renderKey','sceneRenderKey','ownerID',
        'vectorMaskHistory'])delete next[field];
      next.splitGroupId=original.type==='material'?group:next.splitGroupId;
      next.splitPartIndex=original.type==='material'?index:next.splitPartIndex;
      next.isParked=!!next.cutHiddenByMask||(spec.keepKeys?!spec.keepKeys.includes(key):false);
      pieces.push({key,sourceID:original.id,nodeID:next.id,outline,hitGeometry,area,type:original.type,
        parked:next.isParked});
      return next;
    });
    if(loc.parent?.cutSourceID){
      loc.nodes.splice(loc.index,1,...nodes);
      selectionID||=loc.parent.id;
    }else{
      const groupID='cut-group-'+uid();
      const container={id:groupID,type:'group',name:'裁片组',opacity:1,
        blendMode:'normal',zIndex:original.zIndex||0,
        cutSourceID:original.splitParentId||original.cutParentId||original.id,
        children:nodes};
      nodes.forEach(node=>{node.creativeGroupID=groupID;});
      loc.nodes.splice(loc.index,1,container);
      selectionID||=groupID;
    }
    affected.push(original.id);
  }
  if(!affected.length)throw Error('切线没有把可见对象分成两片；请从对象外画到另一侧');
  return {draft:trial,pieces,affected,selectionID};
}

export function restoreSceneMasks(draft,selectedID,{last=false}={}){
  const trial=attachSceneV2(structuredClone(draft)),target=findSceneNode(trial,selectedID);
  if(!target)throw Error('请先选择要恢复蒙版的对象');
  const visit=node=>{
    if(node.type==='group')return (node.children||[]).reduce((count,child)=>count+visit(child),0);
    if(!node.vectorMask)return 0;
    if(last&&!node.vectorMaskHistory?.length)return 0;
    if(last){
      const steps=[...node.vectorMaskHistory],step=steps.pop();
      if(step.before)node.vectorMask=structuredClone(step.before);else delete node.vectorMask;
      if(steps.length)node.vectorMaskHistory=steps;else delete node.vectorMaskHistory;
    }else{delete node.vectorMask;delete node.vectorMaskHistory;}
    return 1;
  };
  if(!visit(target))throw Error('当前对象没有可恢复的蒙版');
  return trial;
}

export function rejoinMaterialPieces(draft,ids,assets,{uid=()=>crypto.randomUUID()}={}){
  if(!Array.isArray(ids)||ids.length<2)throw Error('请至少选择两片同源裁片');
  const trial=attachSceneV2(structuredClone(draft)),records=new Map((assets||[]).map(a=>[a.id,a]));
  const locations=ids.map(id=>findLocation(trial.layers,id));
  if(locations.some(loc=>!loc||loc.node.type!=='material'))throw Error('只能拼合同源实体裁片');
  const first=locations[0].node,asset=records.get(first.assetID);
  if(!asset||!first.splitParentId||locations.some(loc=>loc.node.assetID!==first.assetID||
    loc.node.splitParentId!==first.splitParentId||
    loc.node.materialUnitIndex!==first.materialUnitIndex||loc.node.vectorMask))
    throw Error('请选择同一实物素材的两片裁片');
  const geometries=locations.map(loc=>itemSourceGeometry(loc.node,asset));
  const joined=geometryUnion(...geometries);
  const recipe=geometryMaterialRecipe(joined,asset);
  // The larger selected piece determines position, rotation, scale and style.
  // The other piece contributes its source region even after it was moved.
  const anchorIndex=geometries.reduce((best,g,index)=>
    geometryArea(g)>geometryArea(geometries[best])?index:best,0);
  const anchor=locations[anchorIndex].node;
  const crop=anchor.cropRect||{x:0,y:0,width:1,height:1},box=recipe.box;
  const sx=anchor.width/(crop.width*asset.physicalWidthMM),
    sy=anchor.height/(crop.height*asset.physicalHeightMM),
    firstCenter=[(crop.x+crop.width/2)*asset.physicalWidthMM,
      (crop.y+crop.height/2)*asset.physicalHeightMM],rad=(anchor.rotation||0)*Math.PI/180,
    c=Math.cos(rad),s=Math.sin(rad);
  const sourceOrigin={x:anchor.x-(firstCenter[0]*sx*c-firstCenter[1]*sy*s),
    y:anchor.y-(firstCenter[0]*sx*s+firstCenter[1]*sy*c)};
  const center=[(box.x+box.width/2)*sx,(box.y+box.height/2)*sy],
    joinedNode={...structuredClone(anchor),id:uid(),cropRect:recipe.crop,
      materialMask:recipe.mask,width:box.width*sx,height:box.height*sy,
      x:sourceOrigin.x+center[0]*c-center[1]*s,
      y:sourceOrigin.y+center[0]*s+center[1]*c,
      isParked:locations.every(loc=>loc.node.isParked),
      materialSteps:[{op:'crop',box:{unit:'ratio',mode:'keep',values:[
        recipe.crop.x,recipe.crop.y,recipe.crop.width,recipe.crop.height]}}]};
  for(const loc of locations)loc.nodes.splice(loc.nodes.indexOf(loc.node),1);
  const siblings=locations[anchorIndex].nodes;
  siblings.splice(Math.min(locations[anchorIndex].index,siblings.length),0,joinedNode);
  const removeEmptyCutGroups=nodes=>{
    for(let index=nodes.length-1;index>=0;index--){
      const node=nodes[index];if(node.type!=='group')continue;
      removeEmptyCutGroups(node.children||[]);
      if(node.cutSourceID&&!node.children?.length)nodes.splice(index,1);
    }
  };
  removeEmptyCutGroups(trial.layers);
  return {draft:trial,nodeID:joinedNode.id};
}

import {attachSceneV2,findSceneNode,validateVectorMask} from './scene-v2.js';
import {itemSourceGeometry,geometryMaterialRecipe} from './craft-region-ops.js';
import {normalizeGeometry,rectangleGeometry,geometryArea,geometryBounds,
  geometryIntersection,geometryDifference,geometryUnion,transformGeometry,AREA_EPSILON} from './craft-topology.js';

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
function segmentClip(a,b){
  let lo=0,hi=1;const dx=b[0]-a[0],dy=b[1]-a[1];
  for(const [p,q] of [[-dx,a[0]],[dx,1-a[0]],[-dy,a[1]],[dy,1-a[1]]]){
    if(Math.abs(p)<1e-10){if(q<0)return null;continue;}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(lo>hi+1e-9)return null;
  }
  return [[a[0]+lo*dx,a[1]+lo*dy],[a[0]+hi*dx,a[1]+hi*dy]];
}
const edgeIndex=p=>Math.abs(p[1])<1e-7?p[0]:Math.abs(p[0]-1)<1e-7?1+p[1]:
  Math.abs(p[1]-1)<1e-7?3-p[0]:Math.abs(p[0])<1e-7?4-p[1]:NaN;
const corner=t=>[[0,0],[1,0],[1,1],[0,1],[0,0]][((t%4)+4)%4];

// Each completed entry/exit through the object produces a partition. Keeping
// the sections separate lets one continuous gesture create three or more
// physical pieces without inventing an extension outside the drawn path.
export function freeLinePartitions(localPoints){
  if(!Array.isArray(localPoints)||localPoints.length<2||localPoints.length>256||
    !localPoints.every(finite))throw Error('请画一条有效的自由切线');
  const inside=p=>p[0]>1e-7&&p[0]<1-1e-7&&p[1]>1e-7&&p[1]<1-1e-7;
  if(inside(localPoints[0])||inside(localPoints.at(-1)))return [];
  const paths=[];let path=[];
  for(let i=1;i<localPoints.length;i++){
    const clipped=segmentClip(localPoints[i-1],localPoints[i]);
    if(!clipped||samePoint(...clipped))continue;
    if(path.length&&!samePoint(path.at(-1),clipped[0]))path=[];
    if(!path.length)path.push(clipped[0]);
    path.push(clipped[1]);
    if(!inside(clipped[1])){if(path.length>=2)paths.push(path);path=[];}
  }
  return paths.flatMap(path=>{
    if(!Number.isFinite(edgeIndex(path[0]))||
      !Number.isFinite(edgeIndex(path.at(-1)))||samePoint(path[0],path.at(-1)))return [];
    let from=edgeIndex(path.at(-1)),to=edgeIndex(path[0]);
    if(to<=from)to+=4;
    const boundary=[];
    for(let edge=Math.floor(from)+1;edge<to-1e-8;edge++)boundary.push(corner(edge));
    const first=normalizeGeometry([[ [...path,...boundary] ]]);
    const remainder=geometryDifference(square,first);
    return geometryArea(first)>=1e-5&&geometryArea(remainder)>=1e-5?[first]:[];
  });
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
function regionFor(node,spec){
  if(spec.preset)return [presetRegion(spec.preset,spec.inset)];
  const local=(spec.points||[]).map(p=>scenePointToLocal(node,p));
  if(spec.pathType==='loop'){
    if(local.length<3||local.length>256)return [];
    const loop=normalizeGeometry([[local]]);
    return [geometryIntersection(loop,square)];
  }
  return freeLinePartitions(local);
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
  if(spec.scope==='all'&&targets&&!targets.size)throw Error('请在剪刀设置中勾选要剪切的图层');
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
  if(node.vectorMask)throw Error('请先取消此素材的局部显示，再分割并分别设置蒙版');
  const crop=node.cropRect||{x:0,y:0,width:1,height:1};
  const map=p=>[(crop.x+p[0]*crop.width)*asset.physicalWidthMM,
    (crop.y+p[1]*crop.height)*asset.physicalHeightMM];
  const current=itemSourceGeometry(node,asset),cuts=regions.map(region=>transformGeometry(region,map));
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
    delete next.craftDisplaySlices;
    next.materialSteps=[{op:'crop',box:{unit:'ratio',mode:'keep',values:[
      recipe.crop.x,recipe.crop.y,recipe.crop.width,recipe.crop.height]}}];
    const local=transformGeometry(g,p=>[(p[0]/asset.physicalWidthMM-crop.x)/crop.width,
      (p[1]/asset.physicalHeightMM-crop.y)/crop.height]);
    return {next,outline:pieceOutline(node,local),area:geometryArea(g)};
  });
}
function vectorParts(node,regions){
  const current=polygon(node.vectorMask),pieces=partitionGeometry(current,regions,1e-5);
  if(pieces.length<2)return null;
  return pieces.map(g=>({next:{...structuredClone(node),vectorMask:maskFromGeometry(g),
    cutParentId:node.cutParentId||node.id},outline:pieceOutline(node,g),area:geometryArea(g)}));
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
  const pieces=[],affected=[];
  for(const original of candidates(trial,spec)){
    const loc=findLocation(trial.layers,original.id);if(!loc)continue;
    const regions=original.type==='ink'?[]:regionFor(original,spec)
      .filter(region=>geometryArea(region)>=1e-5);
    if(original.type!=='ink'&&!regions.length)continue;
    if(spec.operation==='mask'){
      if(original.type==='ink')throw Error('请先将笔迹组合，再在组上设置局部显示');
      const current=polygon(original.vectorMask),region=geometryUnion(...regions),next=spec.hideRegion?
        geometryDifference(current,region):geometryIntersection(current,region);
      if(geometryArea(next)<1e-5)throw Error('局部显示不能隐藏整个对象');
      original.vectorMask=maskFromGeometry(next);affected.push(original.id);
      pieces.push({key:original.id+':mask',sourceID:original.id,
        outline:pieceOutline(original,next),area:geometryArea(next),type:original.type});
      continue;
    }
    const result=original.type==='material'?materialParts(original,regions,records.get(original.assetID)):
      original.type==='ink'?inkParts(original,spec):vectorParts(original,regions);
    if(!result)continue;
    const group=uid(),nodes=result.map(({next,outline,area},index)=>{
      const key=original.id+':'+index;
      next.id=uid();next.zIndex=(original.zIndex||0)+index*.0001;
      next.splitGroupId=original.type==='material'?group:next.splitGroupId;
      next.splitPartIndex=original.type==='material'?index:next.splitPartIndex;
      next.isParked=spec.keepKeys? !spec.keepKeys.includes(key):false;
      pieces.push({key,sourceID:original.id,nodeID:next.id,outline,area,type:original.type,
        parked:next.isParked});
      return next;
    });
    loc.nodes.splice(loc.index,1,...nodes);affected.push(original.id);
  }
  if(!affected.length)throw Error('切线没有把可见对象分成两片；请从对象外画到另一侧');
  return {draft:trial,pieces,affected};
}

export function rejoinMaterialPieces(draft,ids,assets,{uid=()=>crypto.randomUUID()}={}){
  if(!Array.isArray(ids)||ids.length<2)throw Error('请至少选择两片同源裁片');
  const trial=attachSceneV2(structuredClone(draft)),records=new Map((assets||[]).map(a=>[a.id,a]));
  const locations=ids.map(id=>findLocation(trial.layers,id));
  if(locations.some(loc=>!loc||loc.node.type!=='material'))throw Error('只能拼合同源实体裁片');
  const first=locations[0].node,asset=records.get(first.assetID);
  if(!asset||!first.splitParentId||locations.some(loc=>loc.node.assetID!==first.assetID||
    loc.node.splitParentId!==first.splitParentId||loc.nodes!==locations[0].nodes||
    loc.node.rotation!==first.rotation||loc.node.isFlippedHorizontally!==first.isFlippedHorizontally||
    loc.node.opacity!==first.opacity||loc.node.vectorMask))
    throw Error('裁片需来自同一素材、同一图层组，且保持相同外观与方向');
  const geometries=locations.map(loc=>itemSourceGeometry(loc.node,asset));
  const sum=geometries.reduce((n,g)=>n+geometryArea(g),0),joined=geometryUnion(...geometries);
  if(Math.abs(sum-geometryArea(joined))>AREA_EPSILON)throw Error('裁片的原图区域重叠，无法拼合');
  const recipe=geometryMaterialRecipe(joined,asset);
  const crop=first.cropRect||{x:0,y:0,width:1,height:1},box=recipe.box;
  const sx=first.width/(crop.width*asset.physicalWidthMM),
    sy=first.height/(crop.height*asset.physicalHeightMM),
    firstCenter=[(crop.x+crop.width/2)*asset.physicalWidthMM,
      (crop.y+crop.height/2)*asset.physicalHeightMM],rad=(first.rotation||0)*Math.PI/180,
    c=Math.cos(rad),s=Math.sin(rad);
  const sourceOrigin={x:first.x-(firstCenter[0]*sx*c-firstCenter[1]*sy*s),
    y:first.y-(firstCenter[0]*sx*s+firstCenter[1]*sy*c)};
  for(const loc of locations.slice(1)){
    const part=loc.node,r=part.cropRect||{x:0,y:0,width:1,height:1},
      center=[(r.x+r.width/2)*asset.physicalWidthMM,
        (r.y+r.height/2)*asset.physicalHeightMM];
    if(Math.abs(part.width-r.width*asset.physicalWidthMM*sx)>1e-3||
      Math.abs(part.height-r.height*asset.physicalHeightMM*sy)>1e-3||
      Math.hypot(part.x-sourceOrigin.x-(center[0]*sx*c-center[1]*sy*s),
        part.y-sourceOrigin.y-(center[0]*sx*s+center[1]*sy*c))>1e-3)
      throw Error('裁片已错位；可以组合移动，拼回原片需先对齐');
  }
  const center=[(box.x+box.width/2)*sx,(box.y+box.height/2)*sy],
    joinedNode={...structuredClone(first),id:uid(),cropRect:recipe.crop,
      materialMask:recipe.mask,width:box.width*sx,height:box.height*sy,
      x:sourceOrigin.x+center[0]*c-center[1]*s,
      y:sourceOrigin.y+center[0]*s+center[1]*c,
      isParked:locations.every(loc=>loc.node.isParked),
      materialSteps:[{op:'crop',box:{unit:'ratio',mode:'keep',values:[
        recipe.crop.x,recipe.crop.y,recipe.crop.width,recipe.crop.height]}}]};
  const siblings=locations[0].nodes,at=Math.min(...locations.map(loc=>loc.index));
  for(const loc of [...locations].sort((a,b)=>b.index-a.index))siblings.splice(loc.index,1);
  siblings.splice(at,0,joinedNode);
  return {draft:trial,nodeID:joinedNode.id};
}

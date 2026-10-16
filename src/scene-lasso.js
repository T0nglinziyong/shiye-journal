import {objectCorners,polygonContains,selectionBounds} from './canvas-selection.js';
import {sceneLayerEntries,findSceneNode,moveSceneNode,removeSceneNode} from './scene-v2.js';
import {pressureInkOutline} from './pressure-ink.js';

const edges=points=>points.map((point,index)=>[point,points[(index+1)%points.length]]);
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const intersect=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&
  Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))&&
  Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y));
const polygonHits=(a,b)=>a.some(point=>polygonContains(point,b))||b.some(point=>polygonContains(point,a))||
  edges(a).some(([p,q])=>edges(b).some(([r,s])=>intersect(p,q,r,s)));
const validPoints=points=>Array.isArray(points)&&points.length>0&&points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
const inkFramePoints=node=>{
  if(node.penStyle==='pressure'){
    const outline=pressureInkOutline(node);
    if(outline.length)return outline.map(([x,y])=>({x,y}));
  }
  const radius=Math.max(.05,(node.width||3)*(node.penStyle==='brush'?.625:.5));
  return (node.points||[]).flatMap(({x,y})=>[
    {x:x-radius,y:y-radius},{x:x+radius,y:y+radius}]);
};
const pruneEmptyGroups=nodes=>{
  for(let index=nodes.length-1;index>=0;index--){
    const node=nodes[index];if(node.type!=='group')continue;
    pruneEmptyGroups(node.children||[]);
    if(!node.children?.length)nodes.splice(index,1);
  }
};

export function selectSceneLasso(draft,polygon,filter={},mode='contain'){
  if(!validPoints(polygon)||polygon.length<3)return [];
  const bounds=selectionBounds(polygon);
  if(bounds.width<1||bounds.height<1)return [];
  return sceneLayerEntries(draft).filter(({kind,value,parents})=>{
    if(filter[kind]===false||kind==='ink'&&filter.lockInk||value.locked||value.isLocked||
      parents.some(parent=>parent.locked||parent.isLocked))return false;
    const points=kind==='ink'?value.points||[]:objectCorners(value);
    if(!validPoints(points))return false;
    if(mode==='intersect')return kind==='ink'?points.some(point=>polygonContains(point,polygon))||
      points.slice(1).some((point,index)=>edges(polygon).some(([a,b])=>intersect(points[index],point,a,b))):
      polygonHits(polygon,points);
    return points.every(point=>polygonContains(point,polygon));
  }).map(entry=>entry.value.id);
}

export function moveSceneLasso(draft,ids,dx,dy){
  if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
  for(const id of new Set(ids)){
    const node=findSceneNode(draft,id);
    if(!node||node.locked||node.isLocked)continue;
    if(node.type==='ink')node.points=(node.points||[]).map(point=>({...point,x:point.x+dx,y:point.y+dy}));
    else {node.x+=dx;node.y+=dy;if(node.type==='material')node.userOverrideFlags=[...new Set([...(node.userOverrideFlags||[]),'moved'])];}
  }
}

export function sceneLassoBounds(draft,ids){
  const selected=new Set(ids),points=[];
  for(const {kind,value} of sceneLayerEntries(draft,{hidden:true})){
    if(!selected.has(value.id))continue;
    points.push(...(kind==='ink'?inkFramePoints(value):objectCorners(value)));
  }
  if(!points.length)return null;
  const bounds=selectionBounds(points);
  return bounds;
}

export function transformSceneLasso(draft,ids,center,scale,degrees){
  if(!(scale>0)||!Number.isFinite(scale)||!Number.isFinite(degrees)||
    !Number.isFinite(center?.x)||!Number.isFinite(center?.y))return false;
  const radians=degrees*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
  const around=point=>({x:center.x+scale*((point.x-center.x)*c-(point.y-center.y)*s),
    y:center.y+scale*((point.x-center.x)*s+(point.y-center.y)*c)});
  const changes=[];
  for(const id of new Set(ids)){
    const node=findSceneNode(draft,id);
    if(!node||node.locked||node.isLocked)return false;
    if(node.type==='ink'){
      const points=(node.points||[]).map(point=>({...point,...around(point)}));
      const width=node.width*scale;
      if(!(width>=.1&&width<=1000)||points.some(point=>
        !Number.isFinite(point.x)||!Number.isFinite(point.y)||Math.abs(point.x)>100000||Math.abs(point.y)>100000))return false;
      changes.push(()=>{node.points=points;node.width=width;});
    }else{
      const position=around(node),width=node.width*scale,height=node.height*scale,
        rotation=(node.rotation||0)+degrees;
      if(!(width>0&&width<=100000&&height>0&&height<=100000)||
        Math.abs(position.x)>100000||Math.abs(position.y)>100000||Math.abs(rotation)>3600)return false;
      changes.push(()=>{
        node.x=position.x;node.y=position.y;node.width=width;node.height=height;node.rotation=rotation;
        if(node.type==='text')for(const field of ['fontSize','fixedLineHeight','lineHeight','lineSpacing',
          'additionalLineSpacing','paragraphSpacing','letterSpacing'])
          if(Number.isFinite(node[field]))node[field]*=scale;
        if(node.type==='shape'&&Number.isFinite(node.lineWidth))node.lineWidth*=scale;
        if(node.type==='material')node.userOverrideFlags=[...new Set([...(node.userOverrideFlags||[]),
          'moved',...(degrees?['rotated']:[]),...(scale!==1?['resized']:[])])];
      });
    }
  }
  changes.forEach(apply=>apply());
  return changes.length>0;
}

export function rotateSceneLasso(draft,ids,center,degrees){
  return transformSceneLasso(draft,ids,center,1,degrees);
}

export function copySceneLasso(draft,ids,makeID){
  const selected=new Set(ids),copies=[];
  for(const {value,parents} of sceneLayerEntries(draft,{hidden:true})){
    if(!selected.has(value.id))continue;
    const copy=structuredClone(value);copy.id=makeID();
    if(copy.type==='ink')copy.points=(copy.points||[]).map(point=>({...point,x:point.x+12,y:point.y+12}));
    else {copy.x+=12;copy.y+=12;}
    const parent=parents.at(-1);
    if(parent){parent.children.push(copy);copy.creativeGroupID=parent.id;}
    else {draft.layers.push(copy);delete copy.creativeGroupID;}
    copies.push(copy.id);
  }
  return copies;
}

export function deleteSceneLasso(draft,ids){
  const selected=new Set(ids);
  for(const {value} of sceneLayerEntries(draft,{hidden:true}).filter(entry=>selected.has(entry.value.id)))
    removeSceneNode(draft,value.id);
  pruneEmptyGroups(draft.layers);
}

export function mergeSceneLasso(draft,ids,{id,name='套索组合'}={}){
  const selected=new Set(ids);
  const entries=sceneLayerEntries(draft,{hidden:true}).filter(entry=>selected.has(entry.value.id));
  if(entries.length<2||entries.length!==selected.size)throw Error('请选择至少两个可编辑图层');
  if(entries.some(entry=>entry.value.locked||entry.value.isLocked||
    entry.parents.some(parent=>parent.locked||parent.isLocked)))throw Error('锁定图层不能合并');
  // First move leaves to root. The new group may contain objects that used to
  // belong to different subtrees; their scene coordinates stay unchanged.
  for(const entry of entries)moveSceneNode(draft,entry.value.id);
  const members=entries.map(entry=>findSceneNode(draft,entry.value.id));
  for(const member of members)removeSceneNode(draft,member.id);
  pruneEmptyGroups(draft.layers);
  const group={id,type:'group',name,opacity:1,blendMode:'normal',children:members};
  members.forEach((member,index)=>{member.creativeGroupID=id;member.zIndex=index+1;});
  group.zIndex=Math.max(0,...draft.layers.map(node=>node.zIndex||0))+1;
  draft.layers.push(group);
  return id;
}

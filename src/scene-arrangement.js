import {assertSceneEditable,findSceneNode,sceneLayerEntries} from './scene-v2.js';
import {sceneLassoBounds} from './scene-lasso.js';

export const sceneArrangementModes=[
  'left','center','right','top','middle','bottom','space-horizontal','space-vertical'
];

// Work in page coordinates. A group is one arrangement unit, but every child
// receives the same translation; this keeps its appearance and source size.
export function arrangeSceneSelection(draft,ids,mode){
  if(!sceneArrangementModes.includes(mode))throw Error('未支持的排列方式');
  const selected=new Set(ids||[]),entries=sceneLayerEntries(draft,{hidden:true});
  const units=[];
  for(const id of selected){
    const node=findSceneNode(draft,id);
    if(!node)throw Error('排列的图层不存在');
    assertSceneEditable(draft,id);
    const self=entries.find(entry=>entry.value.id===id);
    if(self?.parents.some(parent=>selected.has(parent.id)))continue;
    const leaves=node.type==='group'?entries.filter(entry=>entry.parents.some(parent=>parent.id===id)):
      self?[self]:[];
    if(!leaves.length)throw Error('组合没有可排列的内容');
    for(const entry of leaves)assertSceneEditable(draft,entry.value.id);
    const bounds=sceneLassoBounds(draft,leaves.map(entry=>entry.value.id));
    if(!bounds||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite))
      throw Error('图层边界无效，无法排列');
    units.push({id,leaves,bounds});
  }
  const distribute=mode.startsWith('space-');
  if(units.length<(distribute?3:2))throw Error(distribute?'均分至少需要三个对象':'对齐至少需要两个对象');
  const left=Math.min(...units.map(unit=>unit.bounds.x)),top=Math.min(...units.map(unit=>unit.bounds.y));
  const right=Math.max(...units.map(unit=>unit.bounds.x+unit.bounds.width));
  const bottom=Math.max(...units.map(unit=>unit.bounds.y+unit.bounds.height));
  const shifts=new Map(units.map(unit=>[unit.id,{dx:0,dy:0}]));
  if(distribute){
    const horizontal=mode==='space-horizontal',axis=horizontal?'x':'y',size=horizontal?'width':'height';
    const ordered=[...units].sort((a,b)=>a.bounds[axis]-b.bounds[axis]||a.id.localeCompare(b.id));
    const extent=horizontal?right:bottom,start=ordered[0].bounds[axis];
    const gap=(extent-start-ordered.reduce((sum,unit)=>sum+unit.bounds[size],0))/(ordered.length-1);
    let cursor=start;
    for(const unit of ordered){shifts.get(unit.id)[horizontal?'dx':'dy']=cursor-unit.bounds[axis];
      cursor+=unit.bounds[size]+gap;}
  }else for(const unit of units){
    const box=unit.bounds,shift=shifts.get(unit.id);
    if(mode==='left')shift.dx=left-box.x;
    if(mode==='center')shift.dx=(left+right-box.width)/2-box.x;
    if(mode==='right')shift.dx=right-box.width-box.x;
    if(mode==='top')shift.dy=top-box.y;
    if(mode==='middle')shift.dy=(top+bottom-box.height)/2-box.y;
    if(mode==='bottom')shift.dy=bottom-box.height-box.y;
  }
  const planned=units.flatMap(unit=>unit.leaves.map(({value})=>({node:value,...shifts.get(unit.id)})));
  if(planned.every(({dx,dy})=>Math.abs(dx)+Math.abs(dy)<1e-7))return false;
  for(const {node,dx,dy} of planned){
    const points=node.type==='ink'?node.points||[]:[node];
    if(!points.every(point=>Number.isFinite(point.x+dx)&&Number.isFinite(point.y+dy)&&
      Math.abs(point.x+dx)<=100000&&Math.abs(point.y+dy)<=100000))throw Error('排列超出允许的画布范围');
  }
  for(const {node,dx,dy} of planned){
    if(node.type==='ink')node.points=node.points.map(point=>({...point,x:point.x+dx,y:point.y+dy}));
    else {node.x+=dx;node.y+=dy;if(node.type==='material')
      node.userOverrideFlags=[...new Set([...(node.userOverrideFlags||[]),'moved'])];}
  }
  return true;
}

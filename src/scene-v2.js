// Scene v2: THE persisted editable layer tree. No parallel persisted arrays.
// Existing editor/craft algorithms receive ephemeral leaf collection views,
// whose supported mutations write through to the same tree.
export const SCENE_VERSION=2;
export const SCENE_FORMAT='shiye-scene';
export const PHYSICAL_BLEND_MODES=Object.freeze(['normal','multiply']);
const types={items:'material',textBlocks:'text',primitives:'shape',strokes:'ink'};
const fields=Object.keys(types),kinds=new Set([...Object.values(types),'group']);
const visible=n=>!n.hidden&&!n.isHidden&&!n.isParked&&!n.parked;
const num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const generatedID=()=>globalThis.crypto?.randomUUID?.()||'layer-'+Math.random().toString(36).slice(2);
const z=n=>n.zIndex??(n.type==='ink'?2000:0);
const children=(nodes,fn,parent=null)=>{for(const node of nodes){if(fn(node,nodes,parent)===true)return true;if(node.type==='group'&&children(node.children||[],fn,node))return true;}return false;};
function allLeaves(nodes,out=[],ancestors=[]){
 for(const n of [...nodes].sort((a,b)=>z(a)-z(b))){if(n.type==='group')allLeaves(n.children||[],out,[...ancestors,n]);
 else out.push({kind:n.type,value:n,parents:ancestors});}
 return out;
}
function detach(nodes,id){for(let i=0;i<nodes.length;i++){const n=nodes[i];if(n.id===id){nodes.splice(i,1);return n;}if(n.type==='group'){const found=detach(n.children||[],id);if(found)return found;}}return null;}
const lookupGroup=(nodes,id)=>{let match=null;children(nodes,n=>{if(n.type==='group'&&n.id===id){match=n;return true;}return false;});return match;};
function insertNode(d,node,parentID){
 const parent=parentID?lookupGroup(d.layers,parentID):null;
 if(parentID&&!parent)throw Error('无法放入不存在的图层组');
 const target=parent?parent.children:d.layers;
 let index=target.findIndex(current=>z(current)>z(node));
 if(index<0)index=target.length;
 target.splice(index,0,node);
}
function leafList(d,type){return allLeaves(d.layers).filter(e=>e.kind===type).map(e=>e.value);}
function replaceKind(d,type,entries){
 const positions=new Map(allLeaves(d.layers).filter(e=>e.kind===type).map(e=>[e.value.id,e.parents.at(-1)?.id||null]));
 for(const old of leafList(d,type))detach(d.layers,old.id);
 for(const entry of entries){const n=entry;if(typeof n.id!=='string'||!n.id)n.id=generatedID();n.type=type;insertNode(d,n,positions.get(n.id)||n.creativeGroupID);}
}
function listView(d,type){
 const list=leafList(d,type);
 const add=(...values)=>{for(const n of values){if(!n||typeof n!=='object')throw Error('图层对象无效');n.id||=generatedID();n.type=type;insertNode(d,n,n.creativeGroupID);}return leafList(d,type).length;};
 const splice=(start,remove,...incoming)=>{const originals=leafList(d,type),size=originals.length,index=Math.max(0,Math.min(size,start<0?size+start:start)),count=Math.max(0,remove??size-index),gone=originals.slice(index,index+count);
   for(const n of gone)detach(d.layers,n.id);
   const before=originals[index-1],after=originals[index+count];const around=before||after;
   for(const n of incoming){n.id||=generatedID();n.type=type;if(around)n.zIndex=around.zIndex??n.zIndex;insertNode(d,n,n.creativeGroupID);}
   return gone;};
 const operations={push:add,pop:()=>splice(-1,1)[0],shift:()=>splice(0,1)[0],unshift:(...values)=>{splice(0,0,...values);return leafList(d,type).length;},splice,
   reverse:()=>{const value=leafList(d,type).reverse();replaceKind(d,type,value);return list;},
   sort:(compare)=>{const value=leafList(d,type).sort(compare);replaceKind(d,type,value);return list;}};
 for(const [name,fn] of Object.entries(operations))Object.defineProperty(list,name,{value:fn,enumerable:false,configurable:true});
 return list;
}
function normalizeGroupLegacy(d){
 const metadata=Array.isArray(d.layerGroups)?d.layerGroups:[];
 for(const group of metadata){const ids=allLeaves(d.layers).filter(e=>e.value.creativeGroupID===group.id).map(e=>e.value.id);
  if(!ids.length)continue;
  const leaves=ids.map(id=>detach(d.layers,id)).filter(Boolean);
  insertNode(d,{id:group.id,type:'group',name:group.name||'手帐组合',opacity:1,blendMode:'normal',children:leaves,zIndex:Math.min(...leaves.map(z))});
 }
}
export function attachSceneV2(d){
 if(!d||typeof d!=='object')throw Error('场景不存在');
 if(!Array.isArray(d.layers)){
  const legacy=Object.fromEntries(fields.map(key=>[key,Array.isArray(d[key])?d[key]:[]]));
  for(const key of fields)delete d[key];
  d.layers=fields.flatMap(field=>legacy[field].map(entry=>({...entry,type:types[field],id:entry.id||generatedID()}))).sort((a,b)=>z(a)-z(b));
  normalizeGroupLegacy(d);
  d.sceneVersion=SCENE_VERSION;
 }
 if(d.sceneVersion!==SCENE_VERSION)throw Error('不支持的 Scene 版本');
 for(const [field,type] of Object.entries(types)){
  const desc=Object.getOwnPropertyDescriptor(d,field);
  if(desc?.get?.__sceneV2)continue;
  if(desc&&Object.hasOwn(desc,'value'))delete d[field];
  const get=function(){return listView(d,type);};get.__sceneV2=true;
  Object.defineProperty(d,field,{configurable:true,enumerable:false,get,set(v){if(!Array.isArray(v))throw Error(field+' 必须是数组');replaceKind(d,type,v);}});
 }
 const groupDesc=Object.getOwnPropertyDescriptor(d,'layerGroups');
 if(!groupDesc?.get?.__sceneV2){
  if(groupDesc)delete d.layerGroups;
  const get=function(){return collectGroups(d.layers).map(g=>({id:g.id,name:g.name,kind:'physical-arrangement'}));};get.__sceneV2=true;
  Object.defineProperty(d,'layerGroups',{configurable:true,enumerable:false,get,set(groups){
   const allowed=new Set((groups||[]).map(g=>g.id));
   for(const g of collectGroups(d.layers).filter(g=>!allowed.has(g.id)))ungroupSceneLayers(d,g.id);
  }});
 }
 return d;
}
function collectGroups(nodes,out=[]){for(const n of nodes){if(n.type==='group'){out.push(n);collectGroups(n.children||[],out);}}return out;}
export function sceneLayerEntries(d,{hidden=false,ink=true}={}){
 attachSceneV2(d);
 return allLeaves(d.layers).filter(e=>(hidden||e.parents.every(visible)&&visible(e.value))&&(ink||e.kind!=='ink'))
  .map((e,index)=>({...e,index})); // tree order, including ink; never re-sort by type
}
export function sceneGroupMembers(d,id){return sceneLayerEntries(d,{hidden:true}).filter(e=>e.parents.some(g=>g.id===id));}
export function groupSceneLayers(d,ids,{id='group-'+generatedID(),name='手帐组合'}={}){
 attachSceneV2(d);
 if(!Array.isArray(ids)||ids.length<2||ids.length>80||new Set(ids).size!==ids.length)throw Error('请选择 2–80 个不同图层进行编组');
 if(!/^[a-zA-Z0-9_-]{1,96}$/.test(id)||lookupGroup(d.layers,id))throw Error('图层组编号无效或重复');
 const selected=sceneLayerEntries(d,{hidden:true}).filter(e=>ids.includes(e.value.id));
 if(selected.length!==ids.length||selected.some(e=>e.value.locked||e.value.isLocked))throw Error('编组包含不存在或锁定的图层');
 const parent=selected[0].parents.at(-1)||null;
 if(selected.some(e=>(e.parents.at(-1)||null)!==parent))throw Error('请在同一图层组中选择素材');
 const siblings=parent?parent.children:d.layers;
 const nodes=ids.map(key=>detach(d.layers,key)).filter(Boolean);
 const group={id,type:'group',name:String(name).slice(0,80),opacity:1,blendMode:'normal',children:nodes,zIndex:Math.min(...nodes.map(z))};
 insertNode(d,group,parent?.id);
 nodes.forEach(n=>n.creativeGroupID=id);
 return id;
}
export function ungroupSceneLayers(d,id){
 attachSceneV2(d);
 const group=lookupGroup(d.layers,id);if(!group)return false;
 let parent=null;children(d.layers,(n,arr,g)=>{if(n===group){parent=g;return true;}return false;});
 const target=parent?parent.children:d.layers,index=target.indexOf(group);
 target.splice(index,1,...group.children);
 for(const leaf of allLeaves(group.children))leaf.value.creativeGroupID=parent?.id||undefined;
 return true;
}
export function sceneGroups(d){attachSceneV2(d);return collectGroups(d.layers);}
export function moveSceneNode(d,id,{parentID=null,beforeID=null}={}){
 attachSceneV2(d);
 const node=findSceneNode(d,id);
 if(!node)throw Error('移动的图层不存在');
 if(node.locked||node.isLocked)throw Error('锁定图层不能移动');
 const parent=parentID?lookupGroup(d.layers,parentID):null;
 if(parentID&&!parent)throw Error('目标图层组不存在');
 if(node===parent||node.type==='group'&&collectGroups(node.children).includes(parent))throw Error('不能把组放入它自己或子组');
 if(parent?.locked||parent?.isLocked)throw Error('目标组已锁定');
 const target=parent?parent.children:d.layers;
 if(beforeID&&!target.some(n=>n.id===beforeID&&n!==node))throw Error('目标位置不属于该图层组');
 const removed=detach(d.layers,id);
 if(!removed)throw Error('无法从旧图层组取出对象');
 let index=beforeID?target.findIndex(n=>n.id===beforeID):target.length;
 if(index<0)index=target.length;
 target.splice(index,0,removed);
 // Tree sibling order is explicit; only within-parent zIndex changes.
 // Global leaf positions/source millimetres remain untouched.
 target.forEach((n,i)=>n.zIndex=i+1);
 if(node.type!=='group'){
  if(parent)node.creativeGroupID=parent.id;
  else delete node.creativeGroupID;
 }
 return true;
}
export function findSceneNode(d,id){
 attachSceneV2(d);let result=null;
 children(d.layers,n=>{if(n.id===id){result=n;return true;}return false;});
 return result;
}

export function transformSceneGroup(d,id,{dx=0,dy=0,rotation=0}={}){
 attachSceneV2(d);
 const group=lookupGroup(d.layers,id);if(!group)throw Error('图层组不存在');
 if(![dx,dy,rotation].every(Number.isFinite)||Math.abs(dx)>20000||Math.abs(dy)>20000||Math.abs(rotation)>180)throw Error('图层组变换超出纸面范围');
 const entries=sceneGroupMembers(d,id);
 if(!entries.length||entries.some(e=>e.value.isLocked||e.value.locked))throw Error('组合中包含锁定或空白的图层');
 const center=entries.filter(e=>e.kind!=='ink').reduce((r,e)=>({x:r.x+e.value.x,y:r.y+e.value.y,n:r.n+1}),{x:0,y:0,n:0});
 const cx=center.n?center.x/center.n:d.canvas.width/2,cy=center.n?center.y/center.n:d.canvas.height/2;
 const theta=rotation*Math.PI/180,cos=Math.cos(theta),sin=Math.sin(theta);
 const move=(x,y)=>({x:cx+(x-cx)*cos-(y-cy)*sin+dx,y:cy+(x-cx)*sin+(y-cy)*cos+dy});
 for(const {kind,value} of entries){
  if(kind==='ink'){value.points=value.points.map(pt=>({...pt,...move(pt.x,pt.y)}));continue;}
  const p=move(value.x,value.y);value.x=p.x;value.y=p.y;value.rotation=(value.rotation||0)+rotation;
  // Only locations and angles change; width, height, crops, material source
  // and stock unit are strictly unchanged.
 }
 group.lastTransform={dx,dy,rotation};
 return true;
}

export function validateVectorMask(mask){
 if(!mask||typeof mask!=='object'||Array.isArray(mask)||Object.keys(mask).some(k=>!['outer','holes'].includes(k)))throw Error('蒙版格式无效');
 const valid=ring=>Array.isArray(ring)&&ring.length>=3&&ring.length<=256&&ring.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>num(v,0,1)));
 if(!valid(mask.outer)||!Array.isArray(mask.holes||[])||(mask.holes||[]).length>16||!(mask.holes||[]).every(valid))throw Error('蒙版轮廓坐标无效');
 const area=r=>Math.abs(r.reduce((v,p,i)=>{const q=r[(i+1)%r.length];return v+p[0]*q[1]-q[0]*p[1];},0)/2);
 if(area(mask.outer)<1e-7||(mask.holes||[]).some(h=>area(h)<1e-7))throw Error('蒙版不能使用零面积轮廓');
 return mask;
}
export function maskSVG(mask){
 validateVectorMask(mask);
 const path=ring=>ring.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' ')+' Z';
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"><path fill="white" fill-rule="evenodd" d="'+[mask.outer,...mask.holes||[]].map(path).join(' ')+'"/></svg>';
}
export function applyVectorMask(ctx,mask,width,height){
 validateVectorMask(mask);ctx.beginPath();
 for(const ring of [mask.outer,...mask.holes||[]]){ring.forEach(([x,y],i)=>i?ctx.lineTo((x-.5)*width,(y-.5)*height):ctx.moveTo((x-.5)*width,(y-.5)*height));ctx.closePath();}
 ctx.clip('evenodd');
}
export function sceneLayerStyle(layer){
 if(layer.blendMode!==undefined&&!PHYSICAL_BLEND_MODES.includes(layer.blendMode))throw Error('实体手帐仅支持普通叠放和正片叠底');
 if(layer.vectorMask)validateVectorMask(layer.vectorMask);
 return {blendMode:layer.blendMode||'normal',mask:layer.vectorMask||null};
}
export function validateSceneExtensions(d){
 attachSceneV2(d);
 if(!d.canvas||!num(d.canvas.width,1,10000)||!num(d.canvas.height,1,10000))throw Error('场景画布尺寸无效');
 const seen=new Set();let count=0;
 function walk(nodes,depth){if(!Array.isArray(nodes)||depth>12||nodes.length>5000)throw Error('Scene 图层树过深或过大');
  for(const node of nodes){if(!node||!kinds.has(node.type)||typeof node.id!=='string'||!node.id||seen.has(node.id))throw Error('Scene 图层类型或编号重复');seen.add(node.id);count++;if(count>10000)throw Error('Scene 图层总数超限');
   sceneLayerStyle(node);
   if(node.opacity!==undefined&&!num(node.opacity,0,1))throw Error('图层透明度必须在 0–1 之间');
   if(node.zIndex!==undefined&&!num(node.zIndex,-100000,100000))throw Error('图层排序值无效');
   if(node.type==='group'){
     if(!Array.isArray(node.children)||node.children.length>1000||
       ['scale','scaleX','scaleY','width','height','assetID'].some(key=>node[key]!==undefined))throw Error('物理图层组不能缩放或复制真实素材');
     if(node.name!==undefined&&(typeof node.name!=='string'||node.name.length>100))throw Error('图层组名称无效');
     walk(node.children,depth+1);
   }else if(node.type==='ink'){
     if(!Array.isArray(node.points)||node.points.length<1||node.points.length>20000||
       !node.points.every(p=>p&&num(p.x,-100000,100000)&&num(p.y,-100000,100000)&&(p.p===undefined||num(p.p,0,1)))||
       !num(node.width,0.1,1000))throw Error('笔迹路径及压感数据无效');
   }else{
     if(![node.x,node.y,node.width,node.height].every(Number.isFinite)||
       !(node.width>0&&node.height>0)||node.width>100000||node.height>100000||
       Math.abs(node.x)>100000||Math.abs(node.y)>100000||
       (node.rotation!==undefined&&!num(node.rotation,-3600,3600)))throw Error('图层尺寸、位置或旋转无效');
     if(node.type==='material'&&(typeof node.assetID!=='string'||!node.assetID))throw Error('缺少真实素材引用');
   }
  }
 }
 walk(d.layers,0);return true;
}
export function canonicalScene(d){
 validateSceneExtensions(d);
 const clone=structuredClone(d);
 return {format:SCENE_FORMAT,version:SCENE_VERSION,scene:clone};
}
export function prepareProjectScene(project){
 if(project?.isSnapshot)return project;
 for(const d of project?.drafts||[])attachSceneV2(d);
 for(const d of project?.initialEditorSnapshot?.drafts||[])attachSceneV2(d);
 for(const d of Object.values(project?.draftHistorySnapshots||{}))attachSceneV2(d);
 for(const a of project?.manualArchives||[])for(const d of a.drafts||[])attachSceneV2(d);
 return project;
}
export function prepareProjectList(rows){return rows?.map(prepareProjectScene)||[];}

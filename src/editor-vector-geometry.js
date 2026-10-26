// UI geometry drafts retain the existing Scene representation. Only an edited
// SVG path is rewritten; arcs stay arcs, smooth handles are expanded exactly.
import {applySceneNodePatch} from './scene-edit-kernel.js';
import {findSceneNode} from './scene-v2.js';
import {USER_SCENE_POLICY} from './scene-edit-policy.js';
const arity={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7,Z:0};
const number=/^[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?/;
const finite=n=>Number.isFinite(n)&&Math.abs(n)<=100000;
export function editableSVGCommands(d){
 if(typeof d!=='string'||!d.length||d.length>8192)throw Error('图形路径为空或过长');
 let rest=d.trim(),command=null,x=0,y=0,sx=0,sy=0,previous='',lastControl=null;const result=[];
 while(rest){
  rest=rest.replace(/^[\s,]+/,'');if(!rest)break;
  if(/^[a-z]/i.test(rest)){command=rest[0];rest=rest.slice(1);}
  const kind=command?.toUpperCase();if(!Object.hasOwn(arity,kind))throw Error('图形路径指令无效');
  if(!result.length&&kind!=='M')throw Error('图形路径需要起点');
  if(kind==='Z'){result.push(['Z']);x=sx;y=sy;previous='Z';lastControl=null;command=null;continue;}
  const a=[];
  for(let i=0;i<arity[kind];i++){
   rest=rest.replace(/^[\s,]+/,'');
   // SVG arc flags may be adjacent ("01"). Consume exactly one digit.
   const match=kind==='A'&&(i===3||i===4)?/^[01]/.exec(rest):number.exec(rest);
   if(!match)throw Error('图形路径缺少有效坐标');a.push(Number(match[0]));rest=rest.slice(match[0].length);
  }
  if(!a.every(finite))throw Error('图形坐标超出范围');
  const relative=command!==kind;
  if(relative){
   if(kind==='H')a[0]+=x;else if(kind==='V')a[0]+=y;
   else if(kind==='A'){a[5]+=x;a[6]+=y;}
   else for(let i=0;i<a.length;i+=2){a[i]+=x;a[i+1]+=y;}
  }
  let next;
  if(kind==='H')next=['L',a[0],y];else if(kind==='V')next=['L',x,a[0]];
  else if(kind==='S'){const c=previous==='C'||previous==='S'?lastControl:[x,y];next=['C',2*x-c[0],2*y-c[1],...a];}
  else if(kind==='T'){const c=previous==='Q'||previous==='T'?lastControl:[x,y];next=['Q',2*x-c[0],2*y-c[1],...a];}
  else next=[kind,...a];
  if(kind==='A'&&(a[0]<0||a[1]<0))throw Error('圆弧半径不能为负');
  x=next.at(-2);y=next.at(-1);
  if(!next.slice(1).every(finite))throw Error('图形坐标超出范围');
  if(kind==='M'){sx=x;sy=y;command=relative?'l':'L';}
  lastControl=next[0]==='C'?next.slice(3,5):next[0]==='Q'?next.slice(1,3):null;
  previous=kind;result.push(next);
  if(result.length>2048)throw Error('图形路径节点过多');
 }
 return result;
}
const serialize=commands=>commands.map(c=>c.join(' ')).join(' ');
const polygon=points=>'M'+points.map(p=>p.join(' ')).join(' L')+' Z';
const rectPoints=([x,y,w,h])=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
export function vectorEditorState(node){
 if(node.type!=='shape')throw Error('请选择自由图形');
 const key=node.svgPaths?'svgPaths':node.vectorLayers?'vectorLayers':'vectorPaths';
 if(!node[key]?.length)throw Error('图形没有可编辑路径');
 const frame=key==='svgPaths'?node.svgViewBox:key==='vectorLayers'?[0,0,...(node.vectorSize||[1,1])]:[0,0,1,1];
 const state={key,value:structuredClone(node[key]),frame:structuredClone(frame)};validateVectorDraft(state);return state;
}
export function vectorContours(state){
 const result=[];
 const add=(points,source,label)=>result.push({source,label,d:polygon(points),handles:points.map((p,i)=>({point:p,index:i,role:'anchor'}))});
 if(state.key==='svgPaths')state.value.forEach((path,index)=>{
  const commands=editableSVGCommands(path.d),handles=[];let start=[0,0],subpath=[0,0];
  commands.forEach((c,ci)=>{
   if(c[0]==='Z'){start=subpath;return;}
   const end=c.slice(-2);if(c[0]==='M')subpath=end;
   if(c[0]==='C'){handles.push({point:c.slice(1,3),command:ci,offset:1,role:'control',from:start},{point:c.slice(3,5),command:ci,offset:3,role:'control',from:end});}
   if(c[0]==='Q')handles.push({point:c.slice(1,3),command:ci,offset:1,role:'control',from:start});
   handles.push({point:end,command:ci,offset:c.length-2,role:'anchor'});start=end;
  });
  result.push({source:{index},label:`路径 ${index+1}`,d:path.d,handles,commands});
 });
 else if(state.key==='vectorPaths')state.value.forEach((points,index)=>add(points,{index},`轮廓 ${index+1}`));
 else state.value.forEach((layer,li)=>{
  (layer.paths||[]).forEach((points,index)=>add(points,{layer:li,index,kind:'paths'},`色层 ${li+1} · 轮廓 ${index+1}`));
  (layer.rects||[]).forEach((rect,index)=>add(rectPoints(rect),{layer:li,index,kind:'rects'},`色层 ${li+1} · 矩形 ${index+1}`));
 });
 return result;
}
export function validateVectorDraft(state){
 if(!state||!['svgPaths','vectorPaths','vectorLayers'].includes(state.key)||!Array.isArray(state.frame)||state.frame.length!==4||!state.frame.every(finite)||state.frame[2]<=0||state.frame[3]<=0)throw Error('图形坐标框无效');
 const value=state.value;if(!Array.isArray(value)||!value.length||value.length>(state.key==='vectorPaths'?48:64))throw Error('图形路径数量无效');
 const validPoints=p=>Array.isArray(p)&&p.length>=2&&p.length<=512&&p.every(v=>Array.isArray(v)&&v.length===2&&v.every(finite));
 if(state.key==='svgPaths')value.forEach(p=>{editableSVGCommands(p.d);});
 else if(state.key==='vectorPaths'){if(!value.every(validPoints))throw Error('轮廓至少需要两个有效节点');}
 else value.forEach(layer=>{
  if(!layer.paths?.length&&!layer.rects?.length)throw Error('色层需要可见几何');
  if(layer.paths&&(!Array.isArray(layer.paths)||layer.paths.length>48||!layer.paths.every(validPoints)))throw Error('色层轮廓无效');
  if(layer.rects&&(!Array.isArray(layer.rects)||layer.rects.length>512||!layer.rects.every(r=>Array.isArray(r)&&r.length===4&&r.every(finite)&&r[2]>0&&r[3]>0)))throw Error('色层矩形无效');
 });
 return state;
}
function writePolygon(state,source,points){
 if(state.key==='vectorPaths')state.value[source.index]=points;
 else{
  const layer=state.value[source.layer];
  if(source.kind==='rects'){
   // Rectangle handles resize the rectangle; no implicit conversion/reordering.
   const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
   layer.rects[source.index]=[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];
  }else layer.paths[source.index]=points;
 }
}
export function moveVectorHandle(state,contourIndex,handleIndex,position){
 if(!Array.isArray(position)||position.length!==2||!position.every(finite))throw Error('图形节点位置无效');
 const next=structuredClone(state),contour=vectorContours(next)[contourIndex],handle=contour?.handles[handleIndex];
 if(!handle)throw Error('请选择轮廓节点');
 if(next.key==='svgPaths'){
  const c=contour.commands[handle.command];c[handle.offset]=position[0];c[handle.offset+1]=position[1];
  next.value[contour.source.index].d=serialize(contour.commands);
 }else{
  const points=contour.handles.map(h=>h.point);
  if(contour.source.kind==='rects'){
   const opposite=points[(handleIndex+2)%4],epsilon=Math.min(next.frame[2],next.frame[3])*1e-5;
   // Keep the grabbed corner on its original side when it reaches the opposite
   // corner, so a continued drag cannot switch anchors and make the box jump.
   const px=[0,3].includes(handleIndex)?Math.min(position[0],opposite[0]-epsilon):Math.max(position[0],opposite[0]+epsilon),py=handleIndex<2?Math.min(position[1],opposite[1]-epsilon):Math.max(position[1],opposite[1]+epsilon);
   const left=Math.min(px,opposite[0]),top=Math.min(py,opposite[1]),right=Math.max(px,opposite[0]),bottom=Math.max(py,opposite[1]);
   writePolygon(next,contour.source,rectPoints([left,top,right-left,bottom-top]));
  }else{points[handleIndex]=position;writePolygon(next,contour.source,points);}
 }
 return validateVectorDraft(next);
}
export function changeVectorPointCount(state,contourIndex,handleIndex,remove=false){
 const next=structuredClone(state),contour=vectorContours(next)[contourIndex];
 if(!contour||next.key==='svgPaths'||contour.source.kind==='rects')throw Error('请在多边形轮廓中增删节点');
 const points=contour.handles.map(h=>h.point);
 if(remove){if(points.length<=3)throw Error('轮廓至少保留三个节点');points.splice(handleIndex,1);}
 else{const p=points[handleIndex],q=points[(handleIndex+1)%points.length];points.splice(handleIndex+1,0,p.map((v,i)=>(v+q[i])/2));}
 writePolygon(next,contour.source,points);return validateVectorDraft(next);
}
export function vectorGeometryPatch(node,state){
 validateVectorDraft(state);const current=vectorEditorState(node);
 if(current.key!==state.key||JSON.stringify(current.frame)!==JSON.stringify(state.frame))throw Error('图形类型或坐标框已改变，请重新打开编辑');
 // Geometry edits cannot overwrite styles changed elsewhere in the inspector.
 if(state.key==='svgPaths'){
  if(current.value.length!==state.value.length)throw Error('图形路径数量已改变，请重新打开编辑');
  return {svgPaths:current.value.map((p,i)=>({...p,d:state.value[i].d}))};
 }
 if(state.key==='vectorLayers'){
  if(current.value.length!==state.value.length)throw Error('图形色层数量已改变，请重新打开编辑');
  return {vectorLayers:current.value.map((layer,i)=>({...layer,paths:state.value[i].paths,rects:state.value[i].rects}))};
 }
 return {vectorPaths:structuredClone(state.value)};
}
export function applyInspectorVectorGeometry(page,id,state){
 const node=findSceneNode(page,id);if(!node)throw Error('图形已不存在');
 return applySceneNodePatch(page,id,vectorGeometryPatch(node,state),{policy:USER_SCENE_POLICY});
}

export function applyInspectorVectorStyle(page,id,{index,field,value}){
 const node=findSceneNode(page,id);if(node?.type!=='shape'||!node.svgPaths?.[index]||!Number.isInteger(index))throw Error('请选择有效路径');
 if(!['fill','stroke','opacity'].includes(field))throw Error('不支持的路径外观');
 if(field==='opacity'){
  if(!Number.isFinite(value)||value<0||value>1)throw Error('路径透明度需在 0–100% 之间');
 }else if(value!=='inherit'&&value!==null&&!/^#[0-9a-f]{6}$/i.test(value))throw Error('请选择路径颜色');
 const svgPaths=structuredClone(node.svgPaths);
 if(value==='inherit')delete svgPaths[index][field];else svgPaths[index][field]=value;
 return applySceneNodePatch(page,id,{svgPaths},{policy:USER_SCENE_POLICY});
}

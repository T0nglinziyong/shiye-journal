// Reusable geometry, independent of why it appears on the page. There is no
// decoration object, target inference or hidden sizing/placement algorithm.
import {commonShapes,advancedShapes} from './editor-tools-model.js';
import {validateShapeOptions} from './advanced-shape-options.js';
export const graphicPresetKinds=Object.freeze([...commonShapes,...advancedShapes].map(([kind])=>kind==='rectangle'?'rect':kind).filter(kind=>kind!=='vector'));
const presets=new Set(graphicPresetKinds);
// Small, deterministic line studies compile into the same editable vector
// paths as any hand-authored path. No extra tool invocation or asset is needed.
export function sketchGeometry({motif,seed=1,waypoints}){
 const phase=(seed%997)*.071;
 const wobble=t=>Math.sin(t*17+phase)*.85+Math.sin(t*31+phase*.7)*.42;
 const path=points=>points.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' ');
 const samples=(count,point)=>Array.from({length:count},(_,i)=>point(i/(count-1)));
 let paths;
 if(motif==='loop'){
  // Leave a deliberate opening: a hand-drawn loop should not look stamped.
  paths=[path(samples(37,t=>{const a=(-.12+t*.94)*Math.PI*2;return [50+(43+wobble(t))*Math.cos(a),50+(43+wobble(t))*Math.sin(a)];}))];
 }else if(motif==='underline'){
  paths=[path(samples(21,t=>[4+t*92,52+Math.sin(t*Math.PI*1.35+phase)*3+wobble(t)*1.3]))];
 }else if(motif==='corner'){
  paths=[path(samples(13,t=>t<.5?[8+wobble(t),8+t*142]:[8+(t-.5)*142,79+wobble(t)]))];
 }else if(motif==='scallop'){
  paths=[path(samples(41,t=>[3+t*94,52+Math.sin(t*7*Math.PI)*8+wobble(t)*.8]))];
 }else if(motif==='trail'){
  if(waypoints){
   // A few material-led waypoints make the gesture specific to this scene.
   // Short gaps and restrained lateral wobble keep it hand drawn and editable.
   paths=waypoints.slice(1).flatMap((end,index)=>{
    const start=waypoints[index],dx=(end[0]-start[0])*90,dy=(end[1]-start[1])*90,length=Math.hypot(dx,dy)||1;
    return [[.03,.46],[.54,.97]].map(([from,to],dash)=>path(samples(7,t=>{
     const u=from+(to-from)*t,offset=Math.sin(Math.PI*t)*(Math.sin(u*9+phase+index*2+dash)*.72+wobble(u+index)*.22);
     return [5+start[0]*90+dx*u-dy/length*offset,5+start[1]*90+dy*u+dx/length*offset];
    })));
   });
  }else{
   // Preserve the ready-made gesture for cases without explicit landmarks.
   const spans=[[.02,.15],[.20,.34],[.39,.56],[.62,.74],[.80,.97]];
   paths=spans.map(([start,end],index)=>path(samples(5,t=>{
    const u=start+(end-start)*t;
    return [3+u*94,53+Math.sin(u*Math.PI*1.2+phase*.2)*10+wobble(u)*1.2+(index%2?1:-1)];
   })));
  }
 }else if(motif==='rays'){
  paths=Array.from({length:7},(_,index)=>{
   const angle=(index/7)*Math.PI*2-.35+Math.sin(phase+index*1.7)*.08;
   const inner=24+(index%3)*2,outer=39+(index%2)*5;
   return path([[50+Math.cos(angle)*inner,50+Math.sin(angle)*inner],[50+Math.cos(angle)*outer,50+Math.sin(angle)*outer]]);
  });
 }else throw Error('未知手绘线形：'+motif);
 return {kind:'path',viewBox:[0,0,100,100],paths:paths.map(d=>({d}))};
}
export function initialGraphicNode(id,geometry,scale,style={}){
 const common={id,agentKey:id,zIndex:500,opacity:1,blendMode:'normal'};
 if(geometry.kind==='stroke')return {...common,type:'ink',points:[{x:0,y:0,p:.5}],layoutRotation:0,width:.5*scale,color:'#546E7A',penStyle:'ballpoint'};
 // A fill-only graphic should not acquire an unrequested dark outline. An
 // unstyled or outline-only graphic keeps the existing visible stroke default.
 const fillOnly=style.fill!=null&&!Object.hasOwn(style,'stroke');
 return {...common,type:'shape',kind:'rectangle',x:0,y:0,rotation:0,width:scale,height:scale,fill:null,stroke:fillOnly?null:'#546E7A',lineWidth:.5*scale};
}
export function inkLocalFrame(node){
 const a=(node.layoutRotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const points=node.points.map(p=>({...p,x:p.x*c+p.y*s,y:-p.x*s+p.y*c}));
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys),w=Math.max(...xs)-left,h=Math.max(...ys)-top;
 return {points,c,s,cx:left+w/2,cy:top+h/2,width:Math.max(node.width,w),height:Math.max(node.width,h),spanX:w,spanY:h};
}
export function replaceGraphicGeometry(node,geometry,scale){
 if(geometry.kind==='sketch')geometry=sketchGeometry(geometry);
 if(geometry.kind==='stroke'){
  if(node.type!=='ink')throw Error('stroke 几何需要笔迹节点；不会隐式转换图层类型');
  const old=inkLocalFrame(node),points=geometry.points,xs=points.map(p=>p.x),ys=points.map(p=>p.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const previous=node.points;node.points=points.map(p=>{const x=old.cx+(p.x-cx)*scale,y=old.cy+(p.y-cy)*scale;return {x:x*old.c-y*old.s,y:x*old.s+y*old.c,...(p.pressure===undefined?{}:{p:p.pressure})};});
  if(previous.length===node.points.length&&previous.every((p,i)=>Math.abs(p.x-node.points[i].x)<1e-9&&Math.abs(p.y-node.points[i].y)<1e-9&&p.p===node.points[i].p))node.points=previous;
  return node;
 }
 if(node.type!=='shape')throw Error('基础图形/path 几何需要图形节点；不会隐式转换图层类型');
 if(geometry.kind!=='path'&&!presets.has(geometry.kind))throw Error('未知图形：'+geometry.kind);
 const nextKind=geometry.kind==='rect'?'rectangle':geometry.kind;
 const retainedOptions=node.kind===nextKind?node.shapeOptions:null;
 // A new kind clears alternate geometry. Same-kind parameter updates retain
 // unmentioned controls so AI can adjust one table dimension at a time.
 for(const key of ['vectorPaths','vectorLayers','vectorSize','svgPaths','svgViewBox','shapeOptions'])delete node[key];
 if(geometry.kind==='path'){
  node.kind='vector';node.svgViewBox=structuredClone(geometry.viewBox);
  node.svgPaths=geometry.paths.map(path=>({d:path.d,...(path.fillRule?{fillRule:path.fillRule}:{}),...(path.style||{})}));
 }else{
  node.kind=nextKind;
  if(geometry.options!==undefined||retainedOptions){
   const options={...retainedOptions,...geometry.options};validateShapeOptions(node.kind,options);
   node.shapeOptions=structuredClone(options);
  }
 }
 return node;
}
export function resizeGraphicInk(node,width,height){
 const frame=inkLocalFrame(node);
 // Stroke thickness is an independent physical style, never multiplied by
 // resize. A degenerate path cannot be stretched into a new geometric shape.
 if(width<node.width-1e-7||height<node.width-1e-7)throw Error('笔迹框不能小于 strokeWidthMm；线宽请通过 style 修改');
 if(frame.spanX<1e-9&&Math.abs(width-node.width)>1e-7||frame.spanY<1e-9&&Math.abs(height-node.width)>1e-7)throw Error('零跨度笔迹不能在该轴拉伸；请修改 geometry.points');
 const sx=frame.spanX&&Math.abs(width-frame.width)>1e-9?width/frame.spanX:1,sy=frame.spanY&&Math.abs(height-frame.height)>1e-9?height/frame.spanY:1;
 if(Math.abs(sx-1)<1e-10&&Math.abs(sy-1)<1e-10)return node;
 node.points=frame.points.map(p=>{const x=frame.cx+(p.x-frame.cx)*sx,y=frame.cy+(p.y-frame.cy)*sy;return {...p,x:x*frame.c-y*frame.s,y:x*frame.s+y*frame.c};});
 return node;
}

// Reusable geometry, independent of why it appears on the page. There is no
// decoration object, target inference or hidden sizing/placement algorithm.
import {commonShapes,advancedShapes} from './editor-tools-model.js';
export const graphicPresetKinds=Object.freeze([...commonShapes,...advancedShapes].map(([kind])=>kind==='rectangle'?'rect':kind).filter(kind=>kind!=='vector'));
const presets=new Set(graphicPresetKinds);
export function initialGraphicNode(id,geometry,scale){
 const common={id,agentKey:id,zIndex:500,opacity:1,blendMode:'normal'};
 if(geometry.kind==='stroke')return {...common,type:'ink',points:[{x:0,y:0,p:.5}],layoutRotation:0,width:.5*scale,color:'#546E7A',penStyle:'ballpoint'};
 return {...common,type:'shape',kind:'rectangle',x:0,y:0,rotation:0,width:scale,height:scale,fill:null,stroke:'#546E7A',lineWidth:.5*scale};
}
export function inkLocalFrame(node){
 const a=(node.layoutRotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const points=node.points.map(p=>({...p,x:p.x*c+p.y*s,y:-p.x*s+p.y*c}));
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys),w=Math.max(...xs)-left,h=Math.max(...ys)-top;
 return {points,c,s,cx:left+w/2,cy:top+h/2,width:Math.max(node.width,w),height:Math.max(node.width,h),spanX:w,spanY:h};
}
export function replaceGraphicGeometry(node,geometry,scale){
 if(geometry.kind==='stroke'){
  if(node.type!=='ink')throw Error('stroke 几何需要笔迹节点；不会隐式转换图层类型');
  const old=inkLocalFrame(node),points=geometry.points,xs=points.map(p=>p.x),ys=points.map(p=>p.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const previous=node.points;node.points=points.map(p=>{const x=old.cx+(p.x-cx)*scale,y=old.cy+(p.y-cy)*scale;return {x:x*old.c-y*old.s,y:x*old.s+y*old.c,...(p.pressure===undefined?{}:{p:p.pressure})};});
  if(previous.length===node.points.length&&previous.every((p,i)=>Math.abs(p.x-node.points[i].x)<1e-9&&Math.abs(p.y-node.points[i].y)<1e-9&&p.p===node.points[i].p))node.points=previous;
  return node;
 }
 if(node.type!=='shape')throw Error('基础图形/path 几何需要图形节点；不会隐式转换图层类型');
 if(geometry.kind!=='path'&&!presets.has(geometry.kind))throw Error('未知图形：'+geometry.kind);
 // A new geometric definition replaces the prior one, not an invisible stale
 // vectorPaths override. Explicit null/undefined clearing goes through kernel.
 for(const key of ['vectorPaths','vectorLayers','vectorSize','svgPaths','svgViewBox'])delete node[key];
 if(geometry.kind==='path'){
  node.kind='vector';node.svgViewBox=structuredClone(geometry.viewBox);
  node.svgPaths=geometry.paths.map(path=>({d:path.d,...(path.fillRule?{fillRule:path.fillRule}:{}),...(path.style||{})}));
 }else node.kind=geometry.kind==='rect'?'rectangle':geometry.kind;
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

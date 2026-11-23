import {materialMaskGeometry} from './material-mask.js';
import {spatialPath,transformPoint,worldBox} from './scene-spatial.js';

const edgeIndices={top:[0,1],right:[1,2],bottom:[3,2],left:[0,3]};
const finitePoint=p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&v>=0&&v<=1);
function validateQuad(quad){
 if(!Array.isArray(quad)||quad.length!==4||quad.some(p=>!finitePoint(p)))throw Error('可见四角须按左上、右上、右下、左下给出四个 0–1 坐标');
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const signs=quad.map((point,i)=>cross(point,quad[(i+1)%4],quad[(i+2)%4]));
 if(signs.some(value=>value<.0001))throw Error('可见四角须构成非退化的顺时针凸四边形');
 return quad;
}
export function approximateQuad(points){
 const ring=points?.length>4&&points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1]?points.slice(0,-1):points;
 if(!ring||ring.length<4)return null;
 if(ring.length>4){
  const choose=score=>ring.reduce((best,p,i)=>score(p)<score(ring[best])?i:best,0);
  const ids=[choose(p=>p[0]+p[1]),choose(p=>p[1]-p[0]),choose(p=>-p[0]-p[1]),choose(p=>p[0]-p[1])];
  if(new Set(ids).size!==4)return null;
  const candidate=ids.map(i=>ring[i]),area=poly=>Math.abs(poly.reduce((sum,p,i)=>sum+p[0]*poly[(i+1)%poly.length][1]-poly[(i+1)%poly.length][0]*p[1],0))/2;
  const ratio=area(ring)/area(candidate);
  if(ratio<.83||ratio>1.08)return null;
  const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
  const deviations=ring.map(p=>Math.min(...candidate.map((a,i)=>distance(p,a,candidate[(i+1)%4])))).sort((a,b)=>a-b);
  if(deviations[Math.floor(deviations.length*.9)]>.035||deviations.at(-1)>.09)return null;
  return validateQuad(candidate);
 }
 const cx=points.reduce((sum,p)=>sum+p[0],0)/4,cy=points.reduce((sum,p)=>sum+p[1],0)/4;
 const ordered=[...points].sort((a,b)=>Math.atan2(a[1]-cy,a[0]-cx)-Math.atan2(b[1]-cy,b[0]-cx));
 const first=ordered.reduce((best,p,i)=>p[0]+p[1]<ordered[best][0]+ordered[best][1]?i:best,0);
 return validateQuad([...ordered.slice(first),...ordered.slice(0,first)]);
}
function materialQuad(node,source,edgeQuads){
 if(node.materialMask){const quad=approximateQuad(materialMaskGeometry(node.materialMask)?.outer);if(!quad)throw Error('素材轮廓并非可靠四边形；请提供观察到的四角或改用普通对齐');return {quad,source:'materialMask'};}
 const snapshot=source?.sourceSnapshots?.find(row=>row.assetID===node.assetID),silhouette=snapshot?.descriptor?.sourceSilhouette;
 if(silhouette?.length===1&&(!node.cropRect||Object.entries(node.cropRect).every(([key,value])=>value===(key==='width'||key==='height'?1:0)))){
  const quad=approximateQuad(silhouette[0]?.[0]);if(quad)return {quad,source:'alphaSilhouette'};
 }
 if(edgeQuads?.[node.assetID]&&(!node.cropRect||Object.entries(node.cropRect).every(([key,value])=>value===(key==='width'||key==='height'?1:0))))return {quad:validateQuad(edgeQuads[node.assetID]),source:'derivedAlpha'};
 return null;
}
export function visibleQuad(page,id,provided,source,edgeQuads){
 const path=spatialPath(page.layers,id);if(!path)throw Error('边缘对象不存在：'+id);
 const node=path.node,box=worldBox(page,id);
 const material=node.type==='material'&&!provided?materialQuad(node,source,edgeQuads):null;
 if(node.type==='material'&&!provided&&!material)throw Error('此素材没有可验证的可见四角；请按预览提供四角 0–1 坐标');
 const quad=validateQuad(provided||material?.quad||[[0,0],[1,0],[1,1],[0,1]]);
 const world=quad.map(([u,v])=>transformPoint(path.world,(u-.5)*box.w,(v-.5)*box.h));
 return {quad,world,source:provided?'observed':material?.source||'frame'};
}
export function edgeAlignment(page,{target,reference,targetEdge,referenceEdge,targetQuad,referenceQuad,gapMm=0,alongMm=0,offsetDeg=0},source,edgeQuads){
 const targetShape=visibleQuad(page,target,targetQuad,source,edgeQuads),referenceShape=visibleQuad(page,reference,referenceQuad,source,edgeQuads);
 const pair=(shape,edge)=>{const [a,b]=edgeIndices[edge]||[];if(a===undefined)throw Error('边缘应为 top/right/bottom/left');const p=shape.world[a],q=shape.world[b];return {mid:{x:(p.x+q.x)/2,y:(p.y+q.y)/2},angle:Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI};};
 const from=pair(targetShape,targetEdge),to=pair(referenceShape,referenceEdge),box=worldBox(page,target),scale=page.canvas.height/page.physicalPageHeightMM;
 let delta=to.angle-from.angle+offsetDeg;while(delta>180)delta-=360;while(delta<=-180)delta+=360;
 const theta=delta*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta),relative={x:from.mid.x-box.cx,y:from.mid.y-box.cy},rotated={x:relative.x*c-relative.y*s,y:relative.x*s+relative.y*c};
 const tangent={x:Math.cos(to.angle*Math.PI/180),y:Math.sin(to.angle*Math.PI/180)};
 const outward={top:{x:tangent.y,y:-tangent.x},bottom:{x:-tangent.y,y:tangent.x},left:{x:-tangent.y,y:tangent.x},right:{x:tangent.y,y:-tangent.x}}[referenceEdge];
 const desired={x:to.mid.x+tangent.x*alongMm*scale+outward.x*gapMm*scale,y:to.mid.y+tangent.y*alongMm*scale+outward.y*gapMm*scale};
 return {x:desired.x-rotated.x,y:desired.y-rotated.y,rotation:box.rotation+delta,targetSource:targetShape.source,referenceSource:referenceShape.source};
}

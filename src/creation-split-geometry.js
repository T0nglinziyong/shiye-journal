import {tearRegionGeometry} from './creation-tear.js';
import {geometryDifference,rectangleGeometry} from './craft-topology.js';
// Intersect an infinite directed line with the object's local rectangle.
export function splitLineGeometry(split,width,height){
 const p=split.unit==='ratio'?[split.through[0]*width,split.through[1]*height]:split.through;
 if(p[0]<=0||p[0]>=width||p[1]<=0||p[1]>=height)throw Error('分割线 through 必须在对象内部');
 const angle=split.rotationDeg*Math.PI/180,d=[Math.cos(angle),Math.sin(angle)],hits=[];
 for(const [axis,limit] of [[0,0],[0,width],[1,0],[1,height]]){
  if(Math.abs(d[axis])<1e-10)continue;
  const t=(limit-p[axis])/d[axis],v=[p[0]+t*d[0],p[1]+t*d[1]];
  if(v[0]>=-1e-7&&v[0]<=width+1e-7&&v[1]>=-1e-7&&v[1]<=height+1e-7)hits.push({t,v:[Math.max(0,Math.min(width,v[0])),Math.max(0,Math.min(height,v[1]))]});
 }
 hits.sort((a,b)=>a.t-b.t);const edge=split.edge||{style:'clean'};
 if(!['clean','torn'].includes(edge.style))throw Error('分割线 edge.style 只支持 clean 或 torn');
 const geometry=tearRegionGeometry({points:[hits[0].v,hits.at(-1).v],unit:'mm'},{width,height,keep:'left',seed:edge.seed??42,depthMm:edge.style==='torn'?(edge.depthMm??Math.min(.6,(edge.roughness??.4)*1.5,Math.min(width,height)*.08)):0,periodMm:edge.periodMm??Math.max(3,(width+height)/40)});
 return [geometry,geometryDifference(rectangleGeometry(0,0,width,height),geometry)];
}

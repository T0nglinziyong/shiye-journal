import polygonClipping from 'polygon-clipping';
import {craftAssert,craftError} from './craft-errors.js';

export const TOPOLOGY_VERSION='shiye-topology-v1';
export const AREA_EPSILON=1e-6; // source mm², never page coverage or an aesthetic score
const MAX_POINTS=8192,MAX_RING=1024,MAX_POLYGONS=128,EPS=1e-9;
export const rectangleGeometry=(x,y,width,height)=>[[[[x,y],[x+width,y],[x+width,y+height],[x,y+height],[x,y]]]];
const same=(a,b)=>Math.abs(a[0]-b[0])<=EPS&&Math.abs(a[1]-b[1])<=EPS;
export function ringArea(ring){let area=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];area+=a[0]*b[1]-a[1]*b[0];}return area/2;}
export function geometryArea(geometry){return geometry.reduce((sum,polygon)=>sum+Math.abs(ringArea(polygon[0]))-polygon.slice(1).reduce((n,ring)=>n+Math.abs(ringArea(ring)),0),0);}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const on=(a,b,p)=>Math.abs(cross(a,b,p))<=EPS&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;
function crossed(a,b,c,d){
 if(Math.max(a[0],b[0])<Math.min(c[0],d[0])-EPS||Math.max(c[0],d[0])<Math.min(a[0],b[0])-EPS||Math.max(a[1],b[1])<Math.min(c[1],d[1])-EPS||Math.max(c[1],d[1])<Math.min(a[1],b[1])-EPS)return false;
 const ac=cross(a,b,c),ad=cross(a,b,d),ca=cross(c,d,a),cb=cross(c,d,b);
 return ac*ad<0&&ca*cb<0||Math.abs(ac)<=EPS&&on(a,b,c)||Math.abs(ad)<=EPS&&on(a,b,d)||Math.abs(ca)<=EPS&&on(c,d,a)||Math.abs(cb)<=EPS&&on(c,d,b);
}
function bounded(geometry,{checkSimple=false}={}){
 craftAssert(Array.isArray(geometry)&&geometry.length<=MAX_POLYGONS,'GEOMETRY_BUDGET','裁切区域过于复杂');
 let count=0;
 for(const polygon of geometry){
  craftAssert(Array.isArray(polygon)&&polygon.length>=1&&polygon.length<=64,'INVALID_GEOMETRY','裁切轮廓和孔洞格式无效');
  for(const ring of polygon){
   craftAssert(Array.isArray(ring)&&ring.length>=3&&ring.length<=MAX_RING,'GEOMETRY_BUDGET','单条轮廓需为 3–1024 个点');
   count+=ring.length;craftAssert(count<=MAX_POINTS,'GEOMETRY_BUDGET','裁切区域超过 8192 点');
   craftAssert(ring.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=20000)),'INVALID_GEOMETRY','裁切坐标不是有限数值');
   craftAssert(Math.abs(ringArea(ring))>EPS,'EMPTY_GEOMETRY','裁切轮廓面积为空');
   if(checkSimple){
    const points=same(ring[0],ring.at(-1))?ring.slice(0,-1):ring;
    for(let i=0;i<points.length;i++){
     const a=points[i],b=points[(i+1)%points.length];craftAssert(!same(a,b),'INVALID_GEOMETRY','轮廓包含重复顶点');
     for(let j=i+1;j<points.length;j++){
      if(j===i+1||i===0&&j===points.length-1)continue;
      craftAssert(!crossed(a,b,points[j],points[(j+1)%points.length]),'SELF_INTERSECTION','轮廓自交或自接，未猜测裁切意图');
     }
    }
   }
  }
 }
 return geometry;
}
export function normalizeGeometry(geometry){
 bounded(geometry,{checkSimple:true});if(!geometry.length)return [];
 try{
  // The library permits malformed holes; the application contract does not.
  for(const polygon of geometry){
   for(let i=1;i<polygon.length;i++){
    const outside=polygonClipping.difference([[polygon[i]]],[[polygon[0]]]);
    craftAssert(geometryArea(outside)<=AREA_EPSILON,'HOLE_OUTSIDE_SOURCE','孔洞越过所属材料边缘');
    for(let j=i+1;j<polygon.length;j++)craftAssert(geometryArea(polygonClipping.intersection([[polygon[i]]],[[polygon[j]]]))<=AREA_EPSILON,'OVERLAPPING_HOLES','输入孔洞彼此重叠，请先合并裁切形状');
   }
  }
  return bounded(polygonClipping.union(geometry));
 }catch(error){if(error.code)throw error;throw craftError('GEOMETRY_FAILED','裁切拓扑无法规范化；原稿未修改');}
}
function operation(name,a,others){
 bounded(a);others.forEach(g=>bounded(g));
 let points=0;for(const geometry of [a,...others])for(const polygon of geometry)for(const ring of polygon){points+=ring.length;craftAssert(points<=MAX_POINTS,'GEOMETRY_BUDGET','复合裁切总点数超过预算');}
 try{return bounded(polygonClipping[name](a,...others));}
 catch(error){if(error.code)throw error;throw craftError('GEOMETRY_FAILED','裁切拓扑计算未完成；请减小工艺复杂度');}
}
export const geometryDifference=(a,...b)=>!a.length?[]:operation('difference',a,b.filter(g=>g.length));
export const geometryIntersection=(a,b)=>!a.length||!b.length?[]:operation('intersection',a,[b]);
export const geometryUnion=(...geometries)=>{const present=geometries.filter(g=>g.length);return present.length?operation('union',present[0],present.slice(1)):[];};
export function geometryBounds(geometry){
 const points=geometry.flat(2);craftAssert(points.length>0,'EMPTY_GEOMETRY','没有可用的材料区域');
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);
 return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
}
export const transformGeometry=(geometry,map)=>geometry.map(polygon=>polygon.map(ring=>ring.map(map)));
export function assertSubset(child,parent,details={}){
 craftAssert(geometryArea(geometryDifference(child,parent))<=AREA_EPSILON,'SOURCE_REGION_OUTSIDE','裁片超出它的真实来源区域',details);
}
export function assertConnected(geometry){
 craftAssert(geometry.length===1,'DISCONNECTED_PIECES','此工序会产生分离纸片；请用复合拆分计划分别保留各片');
 return geometry;
}
export function geometryPointInside(point,geometry){
 const inRing=ring=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if(on(a,b,point))return true;if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
 return geometry.some(polygon=>inRing(polygon[0])&&!polygon.slice(1).some(inRing));
}
export function bridgeGeometry(from,to,width){
 craftAssert(Array.isArray(from)&&Array.isArray(to)&&from.length===2&&to.length===2&&[...from,...to].every(Number.isFinite),'INVALID_BRIDGE','连接端点无效');
 craftAssert(Number.isFinite(width)&&width>0,'INVALID_BRIDGE','连接宽度必须是正数');
 const dx=to[0]-from[0],dy=to[1]-from[1],length=Math.hypot(dx,dy);craftAssert(length>EPS,'INVALID_BRIDGE','连接端点重合');
 const nx=-dy/length*width/2,ny=dx/length*width/2;
 return [[[ [from[0]+nx,from[1]+ny],[to[0]+nx,to[1]+ny],[to[0]-nx,to[1]-ny],[from[0]-nx,from[1]-ny],[from[0]+nx,from[1]+ny] ]]];
}
// Minkowski expansion by a bounded, inscribed regular polygon. It grows only a
// selection margin; the result is clipped to the confirmed source before use.
export function expandGeometry(geometry,marginMM){
 craftAssert(Number.isFinite(marginMM)&&marginMM>=0&&marginMM<=20,'INVALID_MARGIN','取材留边为 0–20 mm');
 if(!marginMM)return geometry;
 const points=geometry.flat(2);craftAssert(points.length<=96,'GEOMETRY_BUDGET','轮廓留边只接受至多 96 个边界点；请简化已确认轮廓');
 const sides=Math.min(64,Math.max(16,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-.01/marginMM))))),parts=[geometry];
 for(const polygon of geometry)for(const ring of polygon){
  for(let i=0;i<ring.length-1;i++){
   const a=ring[i],b=ring[i+1];if(same(a,b))continue;
   parts.push(bridgeGeometry(a,b,2*marginMM));
   parts.push([[Array.from({length:sides+1},(_,n)=>[a[0]+marginMM*Math.cos(n*2*Math.PI/sides),a[1]+marginMM*Math.sin(n*2*Math.PI/sides)])]]);
  }
 }
 let result=[];for(const part of parts)result=geometryUnion(result,part);return result;
}

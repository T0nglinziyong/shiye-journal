import {normalizeGeometry,rectangleGeometry,geometryArea,geometryDifference,geometryIntersection,geometryUnion,ringArea,transformGeometry,AREA_EPSILON} from './craft-topology.js';

const token=/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
const command=/^[AaCcHhLlMmQqSsTtVvZz]$/;
const counts={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7,Z:0};
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const sample=(length)=>Math.max(8,Math.min(96,Math.ceil(length/2)));
const pointOnCubic=(a,b,c,d,t)=>{const u=1-t;return [u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]];};
const pointOnQuad=(a,b,c,t)=>{const u=1-t;return [u*u*a[0]+2*u*t*b[0]+t*t*c[0],u*u*a[1]+2*u*t*b[1]+t*t*c[1]];};
function arcPoints(start,end,rx,ry,phi,large,sweep){
 rx=Math.abs(rx);ry=Math.abs(ry);if(rx<1e-8||ry<1e-8)return [end];
 const angle=phi*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle),
  midX=(start[0]-end[0])/2,midY=(start[1]-end[1])/2,
  x=co*midX+si*midY,y=-si*midX+co*midY;
 const expand=Math.sqrt(Math.max(1,x*x/(rx*rx)+y*y/(ry*ry)));rx*=expand;ry*=expand;
 const numerator=Math.max(0,rx*rx*ry*ry-rx*rx*y*y-ry*ry*x*x),
  denominator=rx*rx*y*y+ry*ry*x*x;
 const factor=(large===sweep?-1:1)*Math.sqrt(denominator<1e-12?0:numerator/denominator);
 const cxp=factor*rx*y/ry,cyp=-factor*ry*x/rx,
  cx=co*cxp-si*cyp+(start[0]+end[0])/2,
  cy=si*cxp+co*cyp+(start[1]+end[1])/2;
 const u=[(x-cxp)/rx,(y-cyp)/ry],v=[(-x-cxp)/rx,(-y-cyp)/ry];
 let begin=Math.atan2(u[1],u[0]),delta=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);
 if(!sweep&&delta>0)delta-=2*Math.PI;if(sweep&&delta<0)delta+=2*Math.PI;
 const n=Math.max(8,Math.min(128,Math.ceil(Math.abs(delta)*Math.max(rx,ry)/2)));
 return Array.from({length:n},(_,i)=>{const a=begin+delta*(i+1)/n;return [cx+co*rx*Math.cos(a)-si*ry*Math.sin(a),cy+si*rx*Math.cos(a)+co*ry*Math.sin(a)];});
}
export function flattenCreationPath(d){
 if(typeof d!=='string'||d.length>8192||!/^[AaCcHhLlMmQqSsTtVvZz0-9+eE.,\s-]+$/.test(d))throw Error('路径字符无效');
 const tokens=d.match(token)||[];
 if(tokens.join('').toLowerCase()!==d.replace(/[\s,]/g,'').toLowerCase())throw Error('路径语法无效');
 const rings=[];let ring=[],at=[0,0],start=[0,0],lastC=null,lastQ=null,index=0,op=null;
 const add=p=>{if(!p.every(Number.isFinite)||Math.max(...p.map(Math.abs))>1e6)throw Error('路径坐标超出范围');ring.push(p);at=p;};
 const close=()=>{if(ring.length<3)throw Error('路径必须包含闭合轮廓');if(distance(ring[0],ring.at(-1))<1e-7)ring.pop();rings.push(ring);ring=[];at=start;lastC=lastQ=null;};
 while(index<tokens.length){
  if(command.test(tokens[index]))op=tokens[index++];
  if(!op)throw Error('路径必须以 M 开始');
  const type=op.toUpperCase(),relative=op!==type,n=counts[type];
  if(type==='Z'){close();op=null;continue;}
  if(index+n>tokens.length||tokens.slice(index,index+n).some(t=>command.test(t)))throw Error('路径参数不足：'+type);
  const v=tokens.slice(index,index+n).map(Number);index+=n;
  if(!v.every(Number.isFinite))throw Error('路径参数无效');
  const absolute=(x,y)=>[x+(relative?at[0]:0),y+(relative?at[1]:0)];
  if(type==='M'){
   if(ring.length)throw Error('前一条路径未闭合');
   start=absolute(v[0],v[1]);add(start);op=relative?'l':'L';lastC=lastQ=null;
  }else if(type==='L'){add(absolute(v[0],v[1]));lastC=lastQ=null;}
  else if(type==='H'){add([v[0]+(relative?at[0]:0),at[1]]);lastC=lastQ=null;}
  else if(type==='V'){add([at[0],v[0]+(relative?at[1]:0)]);lastC=lastQ=null;}
  else if(type==='C'||type==='S'){
   const a=at,b=type==='C'?absolute(v[0],v[1]):lastC?[2*a[0]-lastC[0],2*a[1]-lastC[1]]:a,
    c=type==='C'?absolute(v[2],v[3]):absolute(v[0],v[1]),
    end=type==='C'?absolute(v[4],v[5]):absolute(v[2],v[3]),
    steps=sample(distance(a,b)+distance(b,c)+distance(c,end));
   for(let i=1;i<=steps;i++)add(pointOnCubic(a,b,c,end,i/steps));
   lastC=c;lastQ=null;
  }else if(type==='Q'||type==='T'){
   const a=at,b=type==='Q'?absolute(v[0],v[1]):lastQ?[2*a[0]-lastQ[0],2*a[1]-lastQ[1]]:a,
    end=type==='Q'?absolute(v[2],v[3]):absolute(v[0],v[1]),steps=sample(distance(a,b)+distance(b,end));
   for(let i=1;i<=steps;i++)add(pointOnQuad(a,b,end,i/steps));
   lastQ=b;lastC=null;
  }else if(type==='A'){
   if(![0,1].includes(v[3])||![0,1].includes(v[4]))throw Error('路径圆弧标志无效');
   const end=absolute(v[5],v[6]);for(const p of arcPoints(at,end,v[0],v[1],v[2],v[3],v[4]))add(p);
   lastC=lastQ=null;
  }
  if(ring.length>4096)throw Error('路径采样点过多');
 }
 if(ring.length)throw Error('路径必须以 Z 闭合');
 if(!rings.length)throw Error('路径没有可见轮廓');
 return rings;
}
// Clip a finite viewport to a directed half-plane. In canvas coordinates the
// numeric cross-product defines left/right; no infinite geometry is persisted.
function halfPlaneRing(from,to,side,width,height){
 const dx=to[0]-from[0],dy=to[1]-from[1];if(Math.hypot(dx,dy)<1e-10)throw Error('半平面需要两个不同端点');
 const sign=side==='left'?1:-1,value=p=>sign*(dx*(p[1]-from[1])-dy*(p[0]-from[0]));
 const input=[[0,0],[width,0],[width,height],[0,height]],out=[];
 for(let i=0;i<input.length;i++){
  const a=input[i],b=input[(i+1)%input.length],va=value(a),vb=value(b),insideA=va>=-1e-9,insideB=vb>=-1e-9;
  if(insideA)out.push(a);
  if(insideA!==insideB){const t=va/(va-vb);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
 }
 const clean=out.filter((p,i)=>i===0||Math.hypot(p[0]-out[i-1][0],p[1]-out[i-1][1])>1e-8);
 if(clean.length>1&&Math.hypot(clean[0][0]-clean.at(-1)[0],clean[0][1]-clean.at(-1)[1])<1e-8)clean.pop();
 if(clean.length<3)throw Error('半平面在素材内没有有效区域');return clean;
}
export function creationRegionGeometry(region,{sourceSize,localSize,crop,output='source'}={}){
 const [sw,sh]=sourceSize,[lw,lh]=localSize;
 if(!region||!['source','local'].includes(region.space)||!['mm','ratio'].includes(region.unit))throw Error('region 必须明确 space 与 unit');
 const viewport=region.space==='source'?[sw,sh]:[lw,lh];
 if(region.shape==='edge'){
  const vertical=['left','right'].includes(region.edge),limit=viewport[vertical?0:1],amount=region.unit==='ratio'?region.amount*limit:region.amount;
  if(!(Number.isFinite(amount)&&amount>0&&amount<=limit))throw Error('边条宽度超出参照区域');
  const box=vertical?[region.edge==='left'?0:viewport[0]-amount,0,amount,viewport[1]]:[0,region.edge==='top'?0:viewport[1]-amount,viewport[0],amount];
  return creationRegionGeometry({shape:'rect',space:region.space,unit:'mm',box},{sourceSize,localSize,crop,output});
 }
 if(region.shape==='halfPlane'){
  if(!['left','right'].includes(region.side))throw Error('半平面 side 无效');
  const mm=p=>region.unit==='ratio'?[p[0]*viewport[0],p[1]*viewport[1]]:p;
  return creationRegionGeometry({shape:'polygon',space:region.space,unit:'mm',points:halfPlaneRing(mm(region.from),mm(region.to),region.side,...viewport)},{sourceSize,localSize,crop,output});
 }
 if(region.shape==='geometry'){
  const convert=p=>{const v=region.unit==='mm'?p:[p[0]*viewport[0],p[1]*viewport[1]];return region.space==='source'?v:[crop.x*sw+v[0]/lw*crop.width*sw,crop.y*sh+v[1]/lh*crop.height*sh];};
  const geometry=transformGeometry(normalizeGeometry(region.geometry),convert);
  if(geometryArea(geometryDifference(geometry,rectangleGeometry(0,0,sw,sh)))>AREA_EPSILON)throw Error('区域超出素材来源');
  return output==='source'?geometry:transformGeometry(geometry,p=>[(p[0]/sw-crop.x)/crop.width,(p[1]/sh-crop.y)/crop.height]);
 }
 let rings;
 if(region.shape==='path')rings=flattenCreationPath(region.d);
 else if(region.shape==='polygon')rings=[region.points];
 else{
  const [x,y,w,h]=region.box;if(!(w>0&&h>0))throw Error('区域宽高无效');
  rings=[region.shape==='ellipse'?Array.from({length:96},(_,i)=>[x+w/2+w/2*Math.cos(i*2*Math.PI/96),y+h/2+h/2*Math.sin(i*2*Math.PI/96)]):[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]];
 }
 const mm=p=>region.unit==='mm'?p:[p[0]*viewport[0],p[1]*viewport[1]];
 const source=p=>{const v=mm(p);return region.space==='source'?v:[crop.x*sw+v[0]/lw*crop.width*sw,crop.y*sh+v[1]/lh*crop.height*sh];};
 const sourceRings=rings.map(ring=>ring.map(source));
 let geometry;
 if(region.shape==='path'&&sourceRings.length>1){
  const entries=sourceRings.map(ring=>({ring,shape:normalizeGeometry([[ring]]),area:Math.abs(ringArea(ring)),sign:Math.sign(ringArea(ring))})).sort((a,b)=>b.area-a.area);
  geometry=[];
  for(const [index,entry] of entries.entries()){
   let parent=null;
   for(const candidate of entries.slice(0,index)){
    const overlap=geometryArea(geometryIntersection(entry.shape,candidate.shape));
    if(overlap>AREA_EPSILON&&Math.abs(overlap-entry.area)>AREA_EPSILON)throw Error('路径子轮廓相交，无法确定填充规则');
    if(Math.abs(overlap-entry.area)<=AREA_EPSILON&&(!parent||candidate.area<parent.area))parent=candidate;
   }
   const before=parent?.winding||0;
   entry.winding=region.fillRule==='evenodd'?(before?0:1):before+entry.sign;
   if(!before&&entry.winding)geometry=geometryUnion(geometry,entry.shape);
   else if(before&&!entry.winding)geometry=geometryDifference(geometry,entry.shape);
  }
 }else geometry=normalizeGeometry([sourceRings]);
 const sourceBounds=rectangleGeometry(0,0,sw,sh);
 if(geometryArea(geometryDifference(geometry,sourceBounds))>AREA_EPSILON)throw Error('区域超出素材来源');
 if(output==='source')return geometry;
 return transformGeometry(geometry,p=>[(p[0]/sw-crop.x)/crop.width,(p[1]/sh-crop.y)/crop.height]);
}

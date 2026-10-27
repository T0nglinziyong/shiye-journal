import {svgArcCenter,svgArcPoint} from './svg-arc.js';
const mix=(a,b,t=.5)=>a.map((v,i)=>v+(b[i]-v)*t);
export function svgPathSegments(commands){
 const segments=[];let at=[0,0],start=[0,0],subpath=0;
 commands.forEach((c,index)=>{
  if(c[0]==='M'){at=c.slice(1);start=at;subpath=index;return;}
  const end=c[0]==='Z'?start:c.slice(-2);
  segments.push({index,kind:c[0],from:at,to:end,subpath,command:c});at=end;
 });return segments;
}
function split(segment){
 const {from:a,to:b,command:c,kind}=segment;
 if(kind==='L'||kind==='Z')return [['L',...mix(a,b)],kind==='Z'?['Z']:['L',...b]];
 if(kind==='Q'){
  const control=c.slice(1,3),p=mix(a,control),q=mix(control,b),middle=mix(p,q);
  return [['Q',...p,...middle],['Q',...q,...b]];
 }
 if(kind==='C'){
  const first=c.slice(1,3),second=c.slice(3,5),p=mix(a,first),q=mix(first,second),r=mix(second,b),u=mix(p,q),v=mix(q,r),middle=mix(u,v);
  return [['C',...p,...u,...middle],['C',...v,...r,...b]];
 }
 if(kind==='A'){
  const arc=svgArcCenter(a,b,...c.slice(1,6));
  if(arc.kind==='point')throw Error('重合端点的圆弧没有可分割的弧线');
  if(arc.kind==='line')return [['L',...mix(a,b)],['L',...b]];
  const middle=svgArcPoint(arc,arc.start+arc.delta/2),half=['A',arc.rx,arc.ry,c[3],0,c[5]];
  return [[...half,...middle],[...half,...b]];
 }
 throw Error('请选择可分割线段');
}
function convert(segment,kind){
 const {from:a,to:b,command:c}=segment;
 if(!['L','Q','C','A'].includes(kind))throw Error('不支持的线段类型');
 if(c[0]===kind)return [...c];
 if(kind==='L')return ['L',...b];
 if(kind==='A'){const radius=Math.max(.001,Math.hypot(b[0]-a[0],b[1]-a[1])*.65);return ['A',radius,radius,0,0,1,...b];}
 if(kind==='C'&&c[0]==='Q')return ['C',...mix(a,c.slice(1,3),2/3),...mix(b,c.slice(1,3),2/3),...b];
 if(kind==='Q'&&c[0]==='C'){
  // Explicit degree reduction keeps the midpoint; it is a shape change.
  const mid=mix(mix(mix(a,c.slice(1,3)),mix(c.slice(1,3),c.slice(3,5))),mix(mix(c.slice(1,3),c.slice(3,5)),mix(c.slice(3,5),b)));
  return ['Q',...mid.map((v,i)=>2*v-(a[i]+b[i])/2),...b];
 }
 const bend=[-(b[1]-a[1])*.2,(b[0]-a[0])*.2],control=t=>mix(a,b,t).map((v,i)=>v+bend[i]);
 return kind==='Q'?['Q',...control(.5),...b]:['C',...control(1/3),...control(2/3),...b];
}
export function editSVGSegment(commands,index,request){
 const next=structuredClone(commands),segment=svgPathSegments(next).find(s=>s.index===index);
 if(!segment)throw Error('请选择一条线段');
 const {action}=request;
 if(action==='split')next.splice(index,1,...split(segment));
 else if(action==='convert'){
  const converted=convert(segment,request.kind);
  next.splice(index,1,converted,...(segment.kind==='Z'?[['Z']]:[]));
 }else if(action==='remove'){
  if(segment.kind==='Z')throw Error('闭合边请使用“打开轮廓”');
  if(svgPathSegments(next).filter(s=>s.subpath===segment.subpath&&s.kind!=='Z').length<=1)throw Error('轮廓至少保留一条线段');
  next.splice(index,1);
 }else if(action==='close'){
  if(typeof request.closed!=='boolean')throw Error('请选择打开或闭合轮廓');
  let end=next.findIndex((c,i)=>i>segment.subpath&&c[0]==='M');if(end<0)end=next.length;
  const closed=next[end-1][0]==='Z';
  if(request.closed&&!closed)next.splice(end,0,['Z']);
  else if(!request.closed&&closed)next.splice(end-1,1);
 }else if(action==='arc'){
  if(segment.kind!=='A')throw Error('请选择圆弧');
  const fields={radiusX:1,radiusY:2,rotation:3,large:4,sweep:5},c=next[index];
  if(!request.values||!Object.keys(request.values).length)throw Error('圆弧参数为空');
  for(const [key,value] of Object.entries(request.values)){
   if(!Object.hasOwn(fields,key)||!Number.isFinite(value)||Math.abs(value)>100000||(['radiusX','radiusY'].includes(key)&&value<0)||(['large','sweep'].includes(key)&&![0,1].includes(value)))throw Error('圆弧参数无效');
   c[fields[key]]=value;
  }
  const arc=svgArcCenter(segment.from,segment.to,...c.slice(1,6));
  if(arc.kind==='arc'){c[1]=arc.rx;c[2]=arc.ry;}
 }else throw Error('不支持的线段操作');
 return next;
}

import {normalizeGeometry,rectangleGeometry,geometryDifference} from './craft-topology.js';
const EPS=1e-7;
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function generator(seed){let state=seed>>>0;return ()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function perimeterPoint(point,w,h){
 const [x,y]=point,candidates=[[Math.abs(y),[x,0],x],[Math.abs(x-w),[w,y],w+y],[Math.abs(y-h),[x,h],w+h+w-x],[Math.abs(x),[0,y],2*w+h+h-y]].sort((a,b)=>a[0]-b[0]);
 if(candidates[0][0]>EPS)throw Error('开放撕纸轨迹的首尾必须位于素材边界');
 return {point:candidates[0][1],t:candidates[0][2]%(2*w+2*h)};
}
export function tearRegionGeometry(path,{width,height,keep,depthMm=.6,periodMm=3,seed}){
 if(!(width>0&&height>0)||!Number.isInteger(seed)||seed<0||seed>2147483647)throw Error('撕纸尺寸或随机种子无效');
 if(!(depthMm>=0&&depthMm<=Math.min(width,height)*.1&&periodMm>=.5&&periodMm<=1000))throw Error('撕口幅度不得超过素材短边的 10%，间距至少 0.5 mm');
 if(!path||!['mm','ratio'].includes(path.unit)||!Array.isArray(path.points)||path.points.length<2||path.points.length>128)throw Error('撕纸轨迹需要 2–128 个点');
 const points=path.points.map(p=>{
  if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw Error('撕纸轨迹坐标无效');
  const v=path.unit==='ratio'?[p[0]*width,p[1]*height]:[...p];
  if(v[0]<0||v[0]>width||v[1]<0||v[1]>height)throw Error('撕纸轨迹超出素材边界');return v;
 });
 const closed=path.closed===true;
 if(closed&&dist(points[0],points.at(-1))<EPS)points.pop();
 if(closed&&points.length<3)throw Error('闭合撕纸至少需要三个点');
 if(![...(closed?['inside','outside']:['left','right'])].includes(keep))throw Error(closed?'闭合轨迹需选择 inside 或 outside':'开放轨迹需选择 left 或 right');
 let start,end;
 if(!closed){
  start=perimeterPoint(points[0],width,height);end=perimeterPoint(points.at(-1),width,height);
  if(dist(start.point,end.point)<EPS)throw Error('开放轨迹不能使用相同的首尾');
  points[0]=start.point;points[points.length-1]=end.point;
  if(points.slice(1,-1).some(([x,y])=>Math.min(x,y,width-x,height-y)<=EPS))throw Error('轨迹中间点必须位于素材内部');
 }
 const random=generator(seed),edgeCount=closed?points.length:points.length-1,lengths=Array.from({length:edgeCount},(_,i)=>dist(points[i],points[(i+1)%points.length]));
 if(lengths.some(l=>l<EPS))throw Error('撕纸轨迹包含重复点');
 const total=lengths.reduce((a,b)=>a+b,0),sampleCount=lengths.reduce((n,l)=>n+Math.ceil(l/(periodMm/3)),0);
 if(sampleCount>850)throw Error('轨迹过长或撕口过密，请增大 periodMm');
 const rough=[];let walked=0;
 for(let i=0;i<edgeCount;i++){
  const a=points[i],b=points[(i+1)%points.length],len=lengths[i],steps=Math.ceil(len/(periodMm/3)),nx=-(b[1]-a[1])/len,ny=(b[0]-a[0])/len;
  for(let j=0;j<steps;j++){
   const t=j/steps,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,s=walked+len*t;
   const fade=closed?1:Math.min(1,s/Math.max(depthMm*3,1),(total-s)/Math.max(depthMm*3,1));
   const amplitude=j===0?0:Math.min(depthMm,Math.max(0,Math.min(x,y,width-x,height-y))*.7)*fade;
   const offset=(random()*2-1)*amplitude;rough.push([x+nx*offset,y+ny*offset]);
  }
  walked+=len;
 }
 const whole=rectangleGeometry(0,0,width,height);
 if(closed){const inside=normalizeGeometry([[rough]]);return keep==='inside'?inside:geometryDifference(whole,inside);}
 rough.push(end.point);
 const perimeter=2*(width+height),finish=start.t<=end.t?start.t+perimeter:start.t;
 const corners=[[0,[0,0]],[width,[width,0]],[width+height,[width,height]],[2*width+height,[0,height]]];
 for(const [t,p] of [...corners,...corners.map(([t,p])=>[t+perimeter,p])].sort((a,b)=>a[0]-b[0]))if(t>end.t+EPS&&t<finish-EPS)rough.push(p);
 const left=normalizeGeometry([[rough]]);
 return keep==='left'?left:geometryDifference(whole,left);
}

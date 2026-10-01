// One geometry source for the editor, covers, project import and raster export.
// Coordinates are local to the calibrated rectangular source crop.
const square=[[0,0],[1,0],[1,1],[0,1]],EPS=1e-7;
const validPoint=point=>Array.isArray(point)&&point.length===2&&point.every(v=>Number.isFinite(v)&&v>=0&&v<=1);
const area=points=>Math.abs(points.reduce((sum,[x,y],i)=>{const [nx,ny]=points[(i+1)%points.length];return sum+x*ny-nx*y;},0))/2;
function polygon(points,label){
  if(!Array.isArray(points)||points.length<3||points.length>256||points.some(point=>!validPoint(point))||area(points)<EPS)throw Error(label+'轮廓无效');
  return points;
}
function diagonalPoints({from,to,keep='left'},initial=square){
  if(!validPoint(from)||!validPoint(to)||!['left','right'].includes(keep)||Math.hypot(to[0]-from[0],to[1]-from[1])<.01)throw Error('斜向裁切线无效');
  const side=p=>(to[0]-from[0])*(p[1]-from[1])-(to[1]-from[1])*(p[0]-from[0]);
  const inside=p=>keep==='left'?side(p)>=-EPS:side(p)<=EPS,result=[];
  for(let i=0;i<initial.length;i++){
    const a=initial[i],b=initial[(i+1)%initial.length],sa=side(a),sb=side(b),ia=inside(a),ib=inside(b);
    if(ia)result.push(a);
    if(ia!==ib){const t=sa/(sa-sb);result.push([Math.max(0,Math.min(1,a[0]+t*(b[0]-a[0]))),Math.max(0,Math.min(1,a[1]+t*(b[1]-a[1])))]);}
  }
  const clean=result.filter((p,i)=>i===0||Math.hypot(p[0]-result[i-1][0],p[1]-result[i-1][1])>EPS);
  if(clean.length>1&&Math.hypot(clean[0][0]-clean.at(-1)[0],clean[0][1]-clean.at(-1)[1])<=EPS)clean.pop();
  polygon(clean,'斜向裁切');if(area(initial)-area(clean)<EPS)throw Error('斜向裁切线没有切到材料');return clean;
}
function outerPoints(mask){
  if(!mask)return square;
  if(mask.shape==='polygon')return polygon(mask.points,'不规则裁剪');
  if(mask.shape==='diagonal')return diagonalPoints(mask);
  if(mask.shape==='rounded'){
    const r=mask.radius??.1,points=[];if(!Number.isFinite(r)||r<.005||r>.5)throw Error('圆角半径无效');
    for(const [cx,cy,start] of [[1-r,r,-Math.PI/2],[1-r,1-r,0],[r,1-r,Math.PI/2],[r,r,Math.PI]])
      for(let i=0;i<=8;i++){const angle=start+i*Math.PI/16;points.push([cx+r*Math.cos(angle),cy+r*Math.sin(angle)]);}
    return points;
  }
  if(mask.shape==='scallop'){
    const depth=mask.depth??.05,waves=mask.waves??8,count=waves*12,edge=t=>depth*(1-Math.cos(2*Math.PI*waves*t))/2;
    if(!Number.isFinite(depth)||depth<.005||depth>.2||!Number.isInteger(waves)||waves<2||waves>20)throw Error('花边参数无效');
    return [...Array.from({length:count+1},(_,i)=>{const t=i/count;return [t,edge(t)];}),...Array.from({length:count+1},(_,i)=>{const t=i/count;return [1-edge(t),t];}),...Array.from({length:count+1},(_,i)=>{const t=i/count;return [1-t,1-edge(t)];}),...Array.from({length:count+1},(_,i)=>{const t=i/count;return [edge(t),1-t];})];
  }
  throw Error('不支持的素材边缘形状');
}
function windowPoints(window){
  const {shape='rectangle',box}=window;
  if(!['rectangle','ellipse'].includes(shape)||!Array.isArray(box)||box.length!==4||box.some(v=>!Number.isFinite(v))||box[0]<=0||box[1]<=0||box[2]<=0||box[3]<=0||box[0]+box[2]>=1||box[1]+box[3]>=1)throw Error('开窗范围必须完全位于材料内部');
  const [x,y,w,h]=box;
  return shape==='rectangle'?[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]:Array.from({length:48},(_,i)=>{const a=i*2*Math.PI/48;return [x+w/2+w/2*Math.cos(a),y+h/2+h/2*Math.sin(a)];});
}
function insidePolygon(point,outline){
  let inside=false;for(let i=0,j=outline.length-1;i<outline.length;j=i++){
    const a=outline[i],b=outline[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function onEdge(point,a,b){return Math.abs(cross(a,b,point))<EPS&&point[0]>=Math.min(a[0],b[0])-EPS&&point[0]<=Math.max(a[0],b[0])+EPS&&point[1]>=Math.min(a[1],b[1])-EPS&&point[1]<=Math.max(a[1],b[1])+EPS;}
function crossing(a,b,c,d){return cross(a,b,c)*cross(a,b,d)<-EPS&&cross(c,d,a)*cross(c,d,b)<-EPS;}
function windowIsInside(points,outline){
  if(points.some(point=>!insidePolygon(point,outline)||outline.some((start,i)=>onEdge(point,start,outline[(i+1)%outline.length]))))return false;
  for(let i=0;i<points.length;i++)for(let j=0;j<outline.length;j++)if(crossing(points[i],points[(i+1)%points.length],outline[j],outline[(j+1)%outline.length]))return false;
  return true;
}
export function materialMaskGeometry(mask){
  if(!mask)return null;
  const outer=outerPoints(mask.shape==='compound'?mask.outer:mask);
  if(mask.shape!=='compound')return {outer,holes:[]};
  if(!Array.isArray(mask.holes)||mask.holes.length>8)throw Error('开窗数量无效');
  const holes=mask.holes.map(windowPoints);
  for(const points of holes)if(!windowIsInside(points,outer))throw Error('开窗必须留在裁片的可见区域内');
  for(let i=0;i<mask.holes.length;i++)for(let j=i+1;j<mask.holes.length;j++){
    const a=mask.holes[i].box,b=mask.holes[j].box;
    if(Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0])>EPS&&Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1])>EPS)throw Error('两个开窗不能重叠');
  }
  return {outer,holes};
}
export function materialMaskPoints(mask){return materialMaskGeometry(mask)?.outer||null;}
export function materialMaskArea(mask){const g=materialMaskGeometry(mask);return g?area(g.outer)-g.holes.reduce((sum,hole)=>sum+area(hole),0):1;}
export function cutMaterialDiagonal(mask,from,to,keep='left'){
  const outer=materialMaskGeometry(mask)?.outer||square,cut=diagonalPoints({from,to,keep},outer);
  const next=mask?.shape==='compound'?{shape:'compound',outer:{shape:'polygon',points:cut},holes:structuredClone(mask.holes)}:{shape:'polygon',points:cut};
  materialMaskGeometry(next);return next;
}
export function addMaterialWindow(mask,window){
  const next=mask?.shape==='compound'?structuredClone(mask):{shape:'compound',outer:mask?structuredClone(mask):null,holes:[]};
  next.holes.push(structuredClone(window));materialMaskGeometry(next);return next;
}
function path(points){return 'M'+points.map(([x,y])=>`${+(x*1000).toFixed(4)} ${+(y*1000).toFixed(4)}`).join('L')+'Z';}
export function materialMaskProperties(mask){
  const geometry=materialMaskGeometry(mask);if(!geometry)return {clipPath:'none',maskImage:'none'};
  if(!geometry.holes.length)return {clipPath:`polygon(${geometry.outer.map(([x,y])=>`${(x*100).toFixed(3)}% ${(y*100).toFixed(3)}%`).join(',')})`,maskImage:'none'};
  const d=[path(geometry.outer),...geometry.holes.map(path)].join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path d="${d}" fill="white" fill-rule="evenodd"/></svg>`;
  return {clipPath:'none',maskImage:`url('data:image/svg+xml,${encodeURIComponent(svg)}')`,maskSize:'100% 100%',maskRepeat:'no-repeat',maskMode:'alpha'};
}
export function materialMaskCSS(item){
  if(!item?.materialMask)return '';
  return Object.entries(materialMaskProperties(item.materialMask)).map(([key,value])=>`${key.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase())}:${value};`).join('');
}
export function clipMaterial(ctx,item){
  const geometry=materialMaskGeometry(item?.materialMask);if(!geometry)return;
  ctx.beginPath();for(const points of [geometry.outer,...geometry.holes]){
    points.forEach(([x,y],index)=>index?ctx.lineTo((x-.5)*item.width,(y-.5)*item.height):ctx.moveTo((x-.5)*item.width,(y-.5)*item.height));ctx.closePath();
  }ctx.clip(geometry.holes.length?'evenodd':'nonzero');
}

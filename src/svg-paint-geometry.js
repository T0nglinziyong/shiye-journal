// Pure SVG path conversion for physical-width paint. The editable definition
// remains untouched; only the derived render geometry is transformed. Arcs
// use cubic segments spanning at most 90 degrees (no polygonal flattening).
const arity={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7,Z:0};
const numeric=/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
const tokens=/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
const isOp=v=>/^[AaCcHhLlMmQqSsTtVvZz]$/.test(v);
const fmt=v=>{if(!Number.isFinite(v)||Math.abs(v)>1e9)throw Error('绘制坐标无效');return String(Math.round(v*1e8)/1e8);};
function arcCubics(a,b,rx,ry,angle,large,sweep){
 rx=Math.abs(rx);ry=Math.abs(ry);if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-12)return [];
 if(rx<1e-12||ry<1e-12)return [['L',...b]];
 const phi=angle*Math.PI/180,c=Math.cos(phi),s=Math.sin(phi),dx=(a[0]-b[0])/2,dy=(a[1]-b[1])/2,x=c*dx+s*dy,y=-s*dx+c*dy;
 const expand=Math.sqrt(Math.max(1,x*x/(rx*rx)+y*y/(ry*ry)));rx*=expand;ry*=expand;
 const denom=rx*rx*y*y+ry*ry*x*x,k=(large===sweep?-1:1)*Math.sqrt(Math.max(0,(rx*rx*ry*ry-denom)/denom));
 const xp=k*rx*y/ry,yp=-k*ry*x/rx,cx=c*xp-s*yp+(a[0]+b[0])/2,cy=s*xp+c*yp+(a[1]+b[1])/2;
 const u=[(x-xp)/rx,(y-yp)/ry],v=[(-x-xp)/rx,(-y-yp)/ry],start=Math.atan2(u[1],u[0]);let delta=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);
 if(!sweep&&delta>0)delta-=2*Math.PI;if(sweep&&delta<0)delta+=2*Math.PI;
 const n=Math.max(1,Math.ceil(Math.abs(delta)/(Math.PI/2))),point=t=>[cx+c*rx*Math.cos(t)-s*ry*Math.sin(t),cy+s*rx*Math.cos(t)+c*ry*Math.sin(t)],derivative=t=>[-c*rx*Math.sin(t)-s*ry*Math.cos(t),-s*rx*Math.sin(t)+c*ry*Math.cos(t)],out=[];
 for(let i=0;i<n;i++){
  const t0=start+delta*i/n,t1=start+delta*(i+1)/n,q=4/3*Math.tan((t1-t0)/4),p0=point(t0),p1=point(t1),d0=derivative(t0),d1=derivative(t1);
  out.push(['C',p0[0]+q*d0[0],p0[1]+q*d0[1],p1[0]-q*d1[0],p1[1]-q*d1[1],...((i===n-1)?b:p1)]);
 }return out;
}
export function physicalSVGPath(d,{sx=1,sy=1,tx=0,ty=0}={}){
 if(typeof d!=='string'||d.length>32768)throw Error('绘制路径超出预算');const parts=d.match(tokens)||[];
 if(parts.join('').toLowerCase()!==d.replace(/[\s,]/g,'').toLowerCase())throw Error('绘制路径字符无效');
 let i=0,op=null,at=[0,0],start=[0,0],lastC=null,lastQ=null,moved=false;const output=[];
 const emit=(kind,values=[])=>output.push(kind+values.map((v,j)=>fmt(v*(j%2?sy:sx)+(j%2?ty:tx))).join(' '));
 while(i<parts.length){
  if(isOp(parts[i]))op=parts[i++];if(!op)throw Error('绘制路径缺少命令');const kind=op.toUpperCase(),relative=op!==kind;
  if(!moved&&kind!=='M')throw Error('绘制路径须以 M 开始');
  if(kind==='Z'){emit('Z');at=[...start];lastC=lastQ=null;op=null;continue;}
  const n=arity[kind];if(i+n>parts.length||parts.slice(i,i+n).some(isOp))throw Error('绘制路径参数不足');const v=parts.slice(i,i+n).map(Number);i+=n;
  if(!v.every(Number.isFinite))throw Error('绘制路径参数无效');const abs=(x,y)=>[x+(relative?at[0]:0),y+(relative?at[1]:0)];
  if(kind==='M'||kind==='L'){at=abs(v[0],v[1]);emit(kind,at);if(kind==='M'){start=[...at];moved=true;op=relative?'l':'L';}lastC=lastQ=null;}
  else if(kind==='H'||kind==='V'){at=kind==='H'?[v[0]+(relative?at[0]:0),at[1]]:[at[0],v[0]+(relative?at[1]:0)];emit('L',at);lastC=lastQ=null;}
  else if(kind==='C'||kind==='S'){
   const c1=kind==='C'?abs(v[0],v[1]):lastC?[2*at[0]-lastC[0],2*at[1]-lastC[1]]:at,c2=kind==='C'?abs(v[2],v[3]):abs(v[0],v[1]),end=kind==='C'?abs(v[4],v[5]):abs(v[2],v[3]);emit('C',[...c1,...c2,...end]);at=end;lastC=c2;lastQ=null;
  }else if(kind==='Q'||kind==='T'){
   const c1=kind==='Q'?abs(v[0],v[1]):lastQ?[2*at[0]-lastQ[0],2*at[1]-lastQ[1]]:at,end=kind==='Q'?abs(v[2],v[3]):abs(v[0],v[1]);emit('Q',[...c1,...end]);at=end;lastQ=c1;lastC=null;
  }else if(kind==='A'){
   if(![0,1].includes(v[3])||![0,1].includes(v[4]))throw Error('绘制路径圆弧标志无效');const end=abs(v[5],v[6]);for(const [t,...args] of arcCubics(at,end,v[0],v[1],v[2],v[3],v[4]))emit(t,args);at=end;lastC=lastQ=null;
  }
  if(output.length>8192)throw Error('绘制路径命令超出预算');
 }return output.join(' ');
}
export function physicalSVGElement(tag,attrs,transform){
 const attribute=k=>attrs.match(new RegExp('(?:^|\\s)'+k+'="([^"]*)"'))?.[1],n=(k,fallback=0)=>Number(attribute(k)??fallback),{sx,sy,tx,ty}=transform;
 const x=k=>fmt(n(k)*sx+tx),y=k=>fmt(n(k)*sy+ty),w=k=>fmt(n(k)*sx),h=k=>fmt(n(k)*sy);
 let geometry;
 if(tag==='path')geometry=`d="${physicalSVGPath(attribute('d')||'',transform)}"`;
 else if(tag==='ellipse'||tag==='circle'){
  const rx=tag==='circle'?n('r'):n('rx'),ry=tag==='circle'?n('r'):n('ry');tag='ellipse';geometry=`cx="${x('cx')}" cy="${y('cy')}" rx="${fmt(rx*sx)}" ry="${fmt(ry*sy)}"`;
 }else if(tag==='rect'){
  const rx=n('rx',n('ry')),ry=n('ry',rx);geometry=`x="${x('x')}" y="${y('y')}" width="${w('width')}" height="${h('height')}" rx="${fmt(rx*sx)}" ry="${fmt(ry*sy)}"`;
 }else if(tag==='line')geometry=`x1="${x('x1')}" y1="${y('y1')}" x2="${x('x2')}" y2="${y('y2')}"`;
 else{
  const values=(attribute('points')||'').match(numeric)?.map(Number)||[];if(values.length%2)throw Error('绘制点集无效');geometry=`points="${values.map((v,i)=>fmt(v*(i%2?sy:sx)+(i%2?ty:tx))).join(' ')}"`;
 }
 // Keep topology and transparency, but do not repeat inherited paint or XML
 // attributes. No external SVG content/DOM is accepted here.
 const extra=['fill-rule','opacity','stroke-linecap'].map(k=>attribute(k)===undefined?'':` ${k}="${attribute(k)}"`).join('');
 return {tag,attrs:geometry+extra};
}


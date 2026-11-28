import {normalizeGeometry,geometryArea} from './craft-topology.js';

const EPS=1e-7;
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const subtract=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const at=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const within=t=>t>=-EPS&&t<=1+EPS;
const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<EPS;
const rounded=p=>p.map(n=>Math.round(n*1e7)).join(',');

// Polygonize the whole drawing, including its self crossings. The centerline
// has zero area, so every resulting face still belongs to exactly one piece.
export function cutFaces(source,stroke){
  if(!Array.isArray(stroke)||stroke.length<2||stroke.length>256)return [];
  const segments=[];
  for(const polygon of source)for(const ring of polygon){
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      if(!near(a,b))segments.push({a,b,ts:[0,1]});
    }
  }
  for(let i=1;i<stroke.length;i++)if(!near(stroke[i-1],stroke[i]))
    segments.push({a:stroke[i-1],b:stroke[i],ts:[0,1]});
  if(segments.length>900)throw Error('切线路径过于复杂，请分次剪切');
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const one=segments[i],two=segments[j],r=subtract(one.b,one.a),s=subtract(two.b,two.a),
      d=cross(r,s),q=subtract(two.a,one.a);
    if(Math.abs(d)>EPS){
      const t=cross(q,s)/d,u=cross(q,r)/d;
      if(within(t)&&within(u)){one.ts.push(Math.max(0,Math.min(1,t)));
        two.ts.push(Math.max(0,Math.min(1,u)));}
    }else if(Math.abs(cross(q,r))<EPS){
      // Coincident endpoints must become vertices even when the pen follows a
      // portion of the source edge; duplicate edges are removed below.
      for(const p of [two.a,two.b]){
        const t=Math.abs(r[0])>Math.abs(r[1])?(p[0]-one.a[0])/r[0]:(p[1]-one.a[1])/r[1];
        if(within(t))one.ts.push(Math.max(0,Math.min(1,t)));
      }
      for(const p of [one.a,one.b]){
        const u=Math.abs(s[0])>Math.abs(s[1])?(p[0]-two.a[0])/s[0]:(p[1]-two.a[1])/s[1];
        if(within(u))two.ts.push(Math.max(0,Math.min(1,u)));
      }
    }
  }
  const vertices=new Map(),edges=new Set(),out=new Map();
  const vertex=p=>{const key=rounded(p);if(!vertices.has(key))vertices.set(key,p);return key;};
  for(const segment of segments){
    const ts=[...new Set(segment.ts.map(t=>Math.round(t*1e9)/1e9))].sort((a,b)=>a-b);
    for(let i=1;i<ts.length;i++){
      const a=vertex(at(segment.a,segment.b,ts[i-1])),b=vertex(at(segment.a,segment.b,ts[i]));
      if(a===b)continue;
      const key=[a,b].sort().join('|');if(edges.has(key))continue;edges.add(key);
      if(!out.has(a))out.set(a,[]);if(!out.has(b))out.set(b,[]);
      out.get(a).push(b);out.get(b).push(a);
    }
  }
  for(const [key,list] of out){const p=vertices.get(key);
    list.sort((a,b)=>Math.atan2(vertices.get(a)[1]-p[1],vertices.get(a)[0]-p[0])-
      Math.atan2(vertices.get(b)[1]-p[1],vertices.get(b)[0]-p[0]));}
  const seen=new Set(),faces=[];
  for(const [from,neighbors] of out)for(const to of neighbors){
    const first=from+'>'+to;if(seen.has(first))continue;
    const ring=[];let a=from,b=to,steps=0;
    do{
      const edge=a+'>'+b;if(seen.has(edge))break;seen.add(edge);ring.push(vertices.get(a));
      const next=out.get(b),reverse=next.indexOf(a);
      [a,b]=[b,next[(reverse-1+next.length)%next.length]];
      if(++steps>edges.size*2+2)throw Error('切线路径无法形成稳定区域');
    }while(a!==from||b!==to);
    if(a!==from||b!==to||ring.length<3)continue;
    const area=ring.reduce((sum,p,i)=>sum+cross(p,ring[(i+1)%ring.length]),0)/2;
    if(area<=EPS)continue;
    // Consecutive collinear samples add no shape information and can exceed
    // the topology budget when the user draws slowly along a straight edge.
    const simple=ring.filter((p,i)=>Math.abs(cross(subtract(p,ring[(i-1+ring.length)%ring.length]),
      subtract(ring[(i+1)%ring.length],p)))>EPS);
    if(simple.length<3)continue;
    const geometry=normalizeGeometry([[simple]]);
    if(geometryArea(geometry)>1e-5)faces.push(geometry);
  }
  return faces;
}

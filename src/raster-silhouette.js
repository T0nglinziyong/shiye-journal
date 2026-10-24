import {normalizeGeometry,geometryPointInside} from './craft-topology.js';

const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8;
const area=ring=>ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
const key=(x,y)=>x+','+y;
const direction=(a,b)=>b[0]>a[0]?0:b[1]>a[1]?1:b[0]<a[0]?2:3;
function simplify(ring,threshold){
  const keep=(points,tolerance)=>{
    if(points.length<3)return points;
    const a=points[0],b=points.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)||1;
    let far=0,index=0;
    for(let i=1;i<points.length-1;i++){
      const distance=Math.abs(dx*(a[1]-points[i][1])-(a[0]-points[i][0])*dy)/length;
      if(distance>far){far=distance;index=i;}
    }
    if(far<=tolerance)return [a,b];
    return [...keep(points.slice(0,index+1),tolerance).slice(0,-1),...keep(points.slice(index),tolerance)];
  };
  // A closed outline is split at two far apart samples before RDP.
  const pivot=Math.floor(ring.length/2),first=keep(ring.slice(0,pivot+1),threshold),
    second=keep([...ring.slice(pivot),ring[0]],threshold);
  return [...first.slice(0,-1),...second.slice(0,-1)];
}

// Reads pixels from a decoded image already held by the editor. The result is
// transient derived geometry, never another stored/uploaded source image.
export function silhouetteFromAlpha(pixels,w,h,{threshold=24}={}){
  if(!(Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&pixels.length===w*h*4))
    throw Error('透明轮廓像素尺寸无效');
  const solid=new Uint8Array(w*h);
  for(let i=0;i<solid.length;i++)solid[i]=pixels[i*4+3]>=threshold?1:0;
  const has=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&solid[y*w+x]===1;
  const starts=new Map(),add=(a,b)=>{
    const k=key(...a),list=starts.get(k)||[];list.push(b);starts.set(k,list);
  };
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(has(x,y)){
    if(!has(x,y-1))add([x,y],[x+1,y]);
    if(!has(x+1,y))add([x+1,y],[x+1,y+1]);
    if(!has(x,y+1))add([x+1,y+1],[x,y+1]);
    if(!has(x-1,y))add([x,y+1],[x,y]);
  }
  const rings=[];let budget=0;
  while(starts.size){
    const [first,list]=starts.entries().next().value,start=first.split(',').map(Number),
      ring=[start];let previous=start,next=list.pop();if(!list.length)starts.delete(first);
    while(next&&!near(next,start)){
      ring.push(next);const k=key(...next),choices=starts.get(k);
      if(!choices?.length)break;
      const incoming=direction(previous,next),priority=[(incoming+1)%4,incoming,(incoming+3)%4,(incoming+2)%4];
      const index=priority.map(d=>choices.findIndex(point=>direction(next,point)===d)).find(i=>i>=0);
      previous=next;next=choices.splice(index??0,1)[0];if(!choices.length)starts.delete(k);
      if(++budget>250000)throw Error('透明轮廓过于复杂');
    }
    if(!next||ring.length<4)continue;
    const clean=simplify(ring,.75).map(([x,y])=>[x/w,y/h]);
    if(clean.length>=3&&Math.abs(area(clean))>.00002&&clean.length<=1024)rings.push(clean);
  }
  const outers=rings.filter(r=>area(r)>0).sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)))
    .slice(0,128).map(outer=>[outer]);
  for(const hole of rings.filter(r=>area(r)<0)){
    const owner=outers.find(poly=>geometryPointInside(hole[0],[[poly[0]]]));
    if(owner&&owner.length<64)owner.push(hole);
  }
  if(!outers.length)return null;
  return normalizeGeometry(outers);
}
export function silhouetteFromImage(image,{edge=128,threshold=24}={}){
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  if(!(width>0&&height>0))throw Error('素材封面尚未解码');
  const scale=Math.min(1,edge/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),
    h=Math.max(1,Math.round(height*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,w,h);
  return silhouetteFromAlpha(ctx.getImageData(0,0,w,h).data,w,h,{threshold});
}

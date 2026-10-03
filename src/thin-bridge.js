// Conservative thin-bridge splitting for candidates that are joined mostly
// by low-evidence / shadow pixels. Genuine narrow printed connections are kept.

const neighbors=[[1,0],[-1,0],[0,1],[0,-1]];
const idx=(x,y,w)=>y*w+x;

function erode(binary,w,h){
  const out=new Uint8Array(binary.length);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=idx(x,y,w);if(!binary[i])continue;
    let keep=1;for(let dy=-1;dy<=1&&keep;dy++)for(let dx=-1;dx<=1;dx++)if(!binary[idx(x+dx,y+dy,w)]){keep=0;break;}
    out[i]=keep;
  }
  return out;
}
function dilate(binary,w,h){
  const out=new Uint8Array(binary.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(binary[idx(x,y,w)])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h)out[idx(xx,yy,w)]=1;}
  return out;
}
function components(binary,w,h){
  const labels=new Int32Array(binary.length),parts=[];let label=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const start=idx(x,y,w);if(!binary[start]||labels[start])continue;label++;const queue=[start],pixels=[];labels[start]=label;
    for(let q=0;q<queue.length;q++){const at=queue[q],cx=at%w,cy=(at/w)|0;pixels.push(at);for(const [dx,dy] of neighbors){const xx=cx+dx,yy=cy+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;const ni=idx(xx,yy,w);if(binary[ni]&&!labels[ni]){labels[ni]=label;queue.push(ni);}}}
    parts.push(pixels);
  }
  return {labels,parts};
}
function boxFor(pixels,w){
  let l=Infinity,t=Infinity,r=-1,b=-1;for(const at of pixels){const x=at%w,y=(at/w)|0;l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}return {l,t,r,b};
}
function materialPixels(candidate){
  const alpha=candidate.mask?.alpha,w=candidate.mask?.width,h=candidate.mask?.height;if(!alpha||!w||!h)return null;
  const binary=Uint8Array.from(alpha,v=>v>127?1:0);return {binary,w,h,area:binary.reduce((a,b)=>a+b,0)};
}
function globalSignal(candidate,localAt,w,globalWidth,evidence,shadow){
  const lx=localAt%w,ly=(localAt/w)|0;
  const gx=Math.min(globalWidth-1,Math.max(0,Math.floor((candidate.x+candidate.w*(lx+.5)/w)*globalWidth)));
  const globalHeight=Math.max(1,Math.round(globalWidth/(candidate.mask.width/candidate.mask.height)*(candidate.w/candidate.h)));
  const gy=Math.max(0,Math.floor((candidate.y+candidate.h*(ly+.5)/candidate.mask.height)*globalHeight));
  const at=gy*globalWidth+gx;
  return {evidence:evidence?.[at]||0,shadow:shadow?.[at]||0};
}
export function splitThinBridgeCandidate(candidate,{analysisWidth,analysisHeight,evidence,shadowLikelihood,smallestMM=6,paperWidthMM=210,paperHeightMM=297}={}){
  const source=materialPixels(candidate);if(!source||source.area<40)return [candidate];
  const {binary,w,h,area}=source;
  const opened=dilate(erode(binary,w,h),w,h),cc=components(opened,w,h);
  const minPart=Math.max(16,Math.round(area*.16)),parts=cc.parts.filter(p=>p.length>=minPart).sort((a,b)=>b.length-a.length);
  if(parts.length!==2)return [candidate];
  const openedArea=parts[0].length+parts[1].length,removed=[];
  for(let i=0;i<binary.length;i++)if(binary[i]&&!opened[i])removed.push(i);
  if(!removed.length||openedArea<area*.88||removed.length>area*.12)return [candidate];
  const ratio=parts[0].length/parts[1].length;if(ratio>4)return [candidate];
  let weak=0,shadow=0;
  for(const at of removed){
    const lx=at%w,ly=(at/w)|0,gx=Math.min(analysisWidth-1,Math.max(0,Math.floor((candidate.x+candidate.w*(lx+.5)/w)*analysisWidth))),gy=Math.min(analysisHeight-1,Math.max(0,Math.floor((candidate.y+candidate.h*(ly+.5)/h)*analysisHeight))),gi=gy*analysisWidth+gx;
    if(!(evidence?.[gi]))weak++;if(shadowLikelihood?.[gi])shadow++;
  }
  if(weak/removed.length<.72&&shadow/removed.length<.45)return [candidate];

  // Multi-source flood-fill assigns the removed neck pixels to the closest
  // surviving core without duplicating or dropping source pixels.
  const labels=new Int32Array(binary.length),queue=[];
  for(let p=0;p<parts.length;p++)for(const at of parts[p]){labels[at]=p+1;queue.push(at);}
  for(let q=0;q<queue.length;q++){const at=queue[q],x=at%w,y=(at/w)|0;for(const [dx,dy] of neighbors){const xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;const ni=idx(xx,yy,w);if(binary[ni]&&!labels[ni]){labels[ni]=labels[at];queue.push(ni);}}}
  const groups=[[],[]];for(let i=0;i<labels.length;i++)if(labels[i])groups[labels[i]-1].push(i);
  const children=[];
  for(const pixels of groups){
    const box=boxFor(pixels,w),cw=box.r-box.l+1,ch=box.b-box.t+1;
    const widthMM=candidate.w*cw/w*paperWidthMM,heightMM=candidate.h*ch/h*paperHeightMM;
    if(widthMM<smallestMM||heightMM<smallestMM)return [candidate];
    const alpha=new Uint8Array(cw*ch);for(const at of pixels){const x=at%w,y=(at/w)|0;alpha[(y-box.t)*cw+x-box.l]=255;}
    children.push({...candidate,x:candidate.x+candidate.w*box.l/w,y:candidate.y+candidate.h*box.t/h,w:candidate.w*cw/w,h:candidate.h*ch/h,pixels:pixels.length,edgeMethod:(candidate.edgeMethod||'contour')+'-bridge-split',mask:{width:cw,height:ch,alpha,polygons:[]}});
  }
  return children;
}
export function splitThinBridges(candidates,options){return candidates.flatMap(candidate=>splitThinBridgeCandidate(candidate,options));}

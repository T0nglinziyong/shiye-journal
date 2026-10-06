import {morphGAC,sobelMagnitude} from './browser-active-contours.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const luma=(data,i)=>data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;

function gaussianKernel(sigma){
  const r=Math.max(1,Math.ceil(sigma*3)),k=new Float32Array(r*2+1);let sum=0;
  for(let i=-r;i<=r;i++){const v=Math.exp(-(i*i)/(2*sigma*sigma));k[i+r]=v;sum+=v;}
  for(let i=0;i<k.length;i++)k[i]/=sum;return {k,r};
}
function blurReflect(src,w,h,sigma=1.5){
  const {k,r}=gaussianKernel(sigma),tmp=new Float32Array(w*h),out=new Float32Array(w*h);
  const refl=(i,n)=>{while(i<0||i>=n){if(i<0)i=-i-1;if(i>=n)i=2*n-i-1;}return i;};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0;for(let d=-r;d<=r;d++)s+=src[y*w+refl(x+d,w)]*k[d+r];tmp[y*w+x]=s;}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0;for(let d=-r;d<=r;d++)s+=tmp[refl(y+d,h)*w+x]*k[d+r];out[y*w+x]=s;}
  return out;
}
function edgeStop(gray,w,h,{alpha=100,sigma=1.5}={}){
  const smooth=blurReflect(gray,w,h,sigma),edge=sobelMagnitude(smooth,w,h),g=new Float32Array(w*h);
  for(let i=0;i<g.length;i++)g[i]=1/Math.sqrt(1+alpha*edge[i]);
  return g;
}
function componentAt(mask,w,h,sx,sy){
  sx=clamp(Math.round(sx),0,w-1);sy=clamp(Math.round(sy),0,h-1);
  if(!mask[sy*w+sx])return null;
  const out=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;const start=sy*w+sx;out[start]=1;queue[tail++]=start;
  const offsets=[-1,1,-w,w,-w-1,-w+1,w-1,w+1];
  while(head<tail){const at=queue[head++],x=at%w,y=(at/w)|0;for(const d of offsets){const q=at+d;if(q<0||q>=mask.length||out[q]||!mask[q])continue;const qx=q%w,qy=(q/w)|0;if(Math.abs(qx-x)>1||Math.abs(qy-y)>1)continue;out[q]=1;queue[tail++]=q;}}
  return out;
}
function enclosedHoles(candidate){
  const m=candidate.mask;if(!m?.alpha)return [];
  const w=m.width,h=m.height,a=m.alpha,outside=new Uint8Array(w*h),q=new Int32Array(w*h);let head=0,tail=0;
  const push=i=>{if(i>=0&&i<a.length&&!outside[i]&&a[i]<=127){outside[i]=1;q[tail++]=i;}};
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x);}for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}
  while(head<tail){const i=q[head++],x=i%w,y=(i/w)|0;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h)push(yy*w+xx);}}
  const holes=[];for(let i=0;i<a.length;i++)if(a[i]<=127&&!outside[i])holes.push(i);return holes;
}
function boundaryScore(mask,g,w,h){
  let sum=0,n=0;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!mask[i])continue;if(!mask[i-1]||!mask[i+1]||!mask[i-w]||!mask[i+w]){sum+=1-g[i];n++;}}
  return n?sum/n:0;
}
function refineOne(pixels,pageW,pageH,candidate,mode){
  const gx=Math.round(candidate.x*pageW),gy=Math.round(candidate.y*pageH),gw=Math.max(2,Math.round(candidate.w*pageW)),gh=Math.max(2,Math.round(candidate.h*pageH));
  const margin=Math.max(5,Math.round(Math.min(gw,gh)*(mode==='quality'?.28:.20))),x0=Math.max(0,gx-margin),y0=Math.max(0,gy-margin),x1=Math.min(pageW,gx+gw+margin),y1=Math.min(pageH,gy+gh+margin),w=x1-x0,h=y1-y0;
  if(w<8||h<8)return candidate;
  const gray=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=((y0+y)*pageW+x0+x)*4;gray[y*w+x]=luma(pixels,p)/255;}
  const g=edgeStop(gray,w,h,{alpha:mode==='quality'?130:105,sigma:1.5}),init=new Uint8Array(w*h);
  // Outside-in initialization: start near the ROI frame, which is expanded
  // from the already-discovered physical instance. This is category-agnostic.
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++)init[y*w+x]=1;
  const result=morphGAC(g,w,h,init,{numIter:mode==='quality'?80:55,smoothing:1,threshold:'auto',balloon:-1});
  const cx=gx+gw/2-x0,cy=gy+gh/2-y0,component=componentAt(result,w,h,cx,cy);
  if(!component)return candidate;
  let area=0,l=w,t=h,r=-1,b=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!component[i])continue;area++;l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
  if(!area||r<l||b<t)return candidate;
  const oldArea=Math.max(1,candidate.pixels||gw*gh),ratio=area/oldArea,score=boundaryScore(component,g,w,h);
  // Safety gate: refinement must remain the same physical instance and have an
  // observed boundary. Otherwise preserve the validated traditional result.
  if(ratio<.55||ratio>4.5||score<(mode==='quality'?.055:.07))return candidate;

  // Preserve already-validated internal apertures from the traditional stage.
  const holes=enclosedHoles(candidate),m=candidate.mask;
  if(holes.length&&m){
    for(const idx of holes){const lx=idx%m.width,ly=(idx/m.width)|0,px=Math.round(gx+lx*gw/m.width)-x0,py=Math.round(gy+ly*gh/m.height)-y0;if(px>=0&&px<w&&py>=0&&py<h)component[py*w+px]=0;}
  }
  // Recompute bounds after aperture preservation (outer bounds are unchanged).
  const bw=r-l+1,bh=b-t+1,alpha=new Uint8Array(bw*bh);let pixelsN=0;
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){const v=component[(t+y)*w+l+x]?255:0;alpha[y*bw+x]=v;if(v)pixelsN++;}
  return {...candidate,x:(x0+l)/pageW,y:(y0+t)/pageH,w:bw/pageW,h:bh/pageH,pixels:pixelsN,edgeMethod:'morphgac-browser',recognitionConfidence:Math.max(candidate.recognitionConfidence||0,.72),refinement:{engine:'morphgac',boundaryScore:score,areaRatio:ratio},mask:{...candidate.mask,width:bw,height:bh,alpha,polygons:[],topologyPreserved:true}};
}
self.onmessage=({data})=>{
  const {id,pixels,width,height,candidates,mode='hybrid'}=data;
  try{
    const result=candidates.map(candidate=>{
      const should=mode==='quality'||(candidate.recognitionConfidence??0)<.74;
      return should?refineOne(pixels,width,height,candidate,mode):candidate;
    });
    const buffers=result.map(x=>x.mask?.alpha?.buffer).filter(Boolean);
    self.postMessage({id,result},buffers);
  }catch(error){self.postMessage({id,error:String(error?.message||error)});}
};
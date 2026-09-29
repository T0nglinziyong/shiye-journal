// Local CPU analysis only: no photos or masks leave the browser.
const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)]||0;
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function hull(points){points.sort((a,b)=>a.x-b.x||a.y-b.y);const a=[],b=[];for(const p of points){while(a.length>1&&cross(a.at(-2),a.at(-1),p)<=0)a.pop();a.push(p);}for(const p of points.slice().reverse()){while(b.length>1&&cross(b.at(-2),b.at(-1),p)<=0)b.pop();b.push(p);}return a.slice(0,-1).concat(b.slice(0,-1));}
function quadrilateral(points){const p=hull(points);while(p.length>4){let at=0,cost=Infinity;for(let i=0;i<p.length;i++){const v=Math.abs(cross(p[(i+p.length-1)%p.length],p[i],p[(i+1)%p.length]));if(v<cost){cost=v;at=i;}}p.splice(at,1);}if(p.length!==4)return null;const start=p.reduce((best,q,i)=>q.x+q.y<p[best].x+p[best].y?i:best,0);return p.slice(start).concat(p.slice(0,start));}
function components(mask,w,h,visit){const seen=new Uint8Array(mask.length),q=new Int32Array(mask.length);for(let start=0;start<mask.length;start++){if(!mask[start]||seen[start])continue;let read=0,end=1;q[0]=start;seen[start]=1;while(read<end){const v=q[read++],x=v%w,y=(v/w)|0;for(const n of [x? v-1:-1,x<w-1?v+1:-1,y?v-w:-1,y<h-1?v+w:-1])if(n>=0&&mask[n]&&!seen[n]){seen[n]=1;q[end++]=n;}}visit(q.subarray(0,end));}}
export function detectPaperQuad({data,width:w,height:h},expectedRatio=210/297){
  let best=null;
  for(const threshold of [150,165,180,195,210]){
    const mask=new Uint8Array(w*h);for(let i=0;i<mask.length;i++){const p=i*4,min=Math.min(data[p],data[p+1],data[p+2]),max=Math.max(data[p],data[p+1],data[p+2]);mask[i]=min>threshold&&max-min<55?1:0;}
    components(mask,w,h,pixels=>{if(pixels.length<w*h*.20)return;const boundary=[];for(const i of pixels){const x=i%w,y=(i/w)|0;if(x===0||y===0||x===w-1||y===h-1||!mask[i-1]||!mask[i+1]||!mask[i-w]||!mask[i+w])boundary.push({x:x/w,y:y/h});}const p=quadrilateral(boundary);if(!p)return;
      const area=p.reduce((sum,a,i)=>sum+a.x*p[(i+1)%4].y-a.y*p[(i+1)%4].x,0)/2;if(area<.30||area>.96||p.filter(a=>a.x<.006||a.x>.994||a.y<.006||a.y>.994).length>=2)return;
      const distance=(a,b)=>Math.hypot((a.x-b.x)*w,(a.y-b.y)*h),rw=distance(p[0],p[1])+distance(p[2],p[3]),rh=distance(p[0],p[3])+distance(p[1],p[2]),ratio=Math.min(rw/rh,rh/rw),expected=Math.min(expectedRatio,1/expectedRatio),aspect=Math.min(ratio/expected,expected/ratio);
      if(aspect<.60)return;const fill=pixels.length/(w*h*area),score=Math.min(area/.65,1)*.48+aspect*.20+Math.min(fill,1)*.32;
      if(!best||score>best.score)best={corners:p,score};});
  }return best?.corners||null;
}
export function segmentPaperMaterials({data,width:w,height:h},{smallestMM=6,paperWidthMM=210,paperHeightMM=297}={}) {
  // Estimate the neutral page colour locally, not a fixed "white > 217".
  // Large cells and robust neutral medians do not learn printed colour as paper.
  const cols=Math.ceil(w/64),rows=Math.ceil(h/64),background=[];
  const edge=[[],[],[]];for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){if(x>w*.04&&x<w*.96&&y>h*.04&&y<h*.96)continue;const p=(y*w+x)*4,max=Math.max(data[p],data[p+1],data[p+2]),min=Math.min(data[p],data[p+1],data[p+2]);if(max-min<45&&min>120)for(let k=0;k<3;k++)edge[k].push(data[p+k]);}
  const fallback=edge.map(a=>median(a)||230);
  for(let by=0;by<rows;by++)for(let bx=0;bx<cols;bx++){const samples=[[],[],[]];for(let y=by*64;y<Math.min(h,(by+1)*64);y+=3)for(let x=bx*64;x<Math.min(w,(bx+1)*64);x+=3){const p=(y*w+x)*4,min=Math.min(data[p],data[p+1],data[p+2]),max=Math.max(data[p],data[p+1],data[p+2]);if(max-min<35&&Math.abs((data[p]+data[p+1]+data[p+2]-fallback.reduce((a,b)=>a+b,0))/3)<28)for(let k=0;k<3;k++)samples[k].push(data[p+k]);}background.push(samples.map((a,k)=>a.length>=12?median(a):fallback[k]));}
  const distance=new Float32Array(w*h),mask=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,p=i*4,bg=background[Math.floor(y/64)*cols+Math.floor(x/64)];distance[i]=Math.max(...bg.map((b,k)=>Math.abs(data[p+k]-b)));mask[i]=data[p+3]>20&&distance[i]>18?1:0;}
  // Close tiny gaps so a printed memo remains one candidate, then derive its
  // exterior contour. Internal pale pixels are preserved in the final mask.
  const closed=new Uint8Array(mask);for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const i=y*w+x;if(!mask[i]&&((mask[i-1]&&mask[i+1])||(mask[i-w]&&mask[i+w])))closed[i]=1;}
  const result=[],minArea=Math.max(20,(smallestMM/paperWidthMM*w)*(smallestMM/paperHeightMM*h)*.12);
  components(closed,w,h,pixels=>{if(pixels.length<minArea)return;let l=w,r=0,t=h,b=0;for(const i of pixels){const x=i%w,y=(i/w)|0;l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}const bw=r-l+1,bh=b-t+1;if(bw/w*paperWidthMM<smallestMM||bh/h*paperHeightMM<smallestMM||bw>w*.94||bh>h*.94)return;
    // Desk slivers at the page boundary are not material candidates.
    if((l<2||r>w-3||t<2||b>h-3)&&(bw<w*.055||bh<h*.055))return;
    const pad=3;l=Math.max(0,l-pad);r=Math.min(w-1,r+pad);t=Math.max(0,t-pad);b=Math.min(h-1,b+pad);const mw=r-l+1,mh=b-t+1,local=new Uint8Array(mw*mh);for(const i of pixels)local[(((i/w)|0)-t)*mw+i%w-l]=1;
    // Fill only enclosed holes in the detection contour; exterior and cutout
    // gaps stay transparent. This keeps white printed details intact.
    const outside=new Uint8Array(local.length),queue=new Int32Array(local.length);let end=0,read=0;const enqueue=i=>{if(i>=0&&!local[i]&&!outside[i]){outside[i]=1;queue[end++]=i;}};for(let x=0;x<mw;x++){enqueue(x);enqueue((mh-1)*mw+x);}for(let y=0;y<mh;y++){enqueue(y*mw);enqueue(y*mw+mw-1);}while(read<end){const i=queue[read++],x=i%mw,y=(i/mw)|0;if(x)enqueue(i-1);if(x<mw-1)enqueue(i+1);if(y)enqueue(i-mw);if(y<mh-1)enqueue(i+mw);}
    const alpha=new Uint8Array(local.length);for(let i=0;i<local.length;i++)alpha[i]=!outside[i]?255:0;
    result.push({x:l/w,y:t/h,w:mw/w,h:mh/h,pixels:pixels.length,mask:{width:mw,height:mh,alpha}});
  });
  // Components entirely enclosed by another material are its printed detail.
  return result.filter((a,i)=>!result.some((b,j)=>i!==j&&a.x>=b.x&&a.y>=b.y&&a.x+a.w<=b.x+b.w&&a.y+a.h<=b.y+b.h)).sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
}

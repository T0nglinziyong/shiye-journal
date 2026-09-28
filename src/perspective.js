// Projective rectification runs entirely on the user's device. Coordinates are
// normalized against the original bitmap; output uses the A4 aspect ratio.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function solveHomography(from,to){
  const m=[];
  for(let i=0;i<4;i++){
    const {x,y}=from[i],{x:u,y:v}=to[i];
    m.push([x,y,1,0,0,0,-u*x,-u*y,u]);
    m.push([0,0,0,x,y,1,-v*x,-v*y,v]);
  }
  for(let c=0;c<8;c++){
    let pivot=c;for(let r=c+1;r<8;r++)if(Math.abs(m[r][c])>Math.abs(m[pivot][c]))pivot=r;
    if(Math.abs(m[pivot][c])<1e-10)throw Error('纸张四角重叠，请重新标注');
    [m[pivot],m[c]]=[m[c],m[pivot]];
    const scale=m[c][c];for(let k=c;k<9;k++)m[c][k]/=scale;
    for(let r=0;r<8;r++)if(r!==c){const factor=m[r][c];for(let k=c;k<9;k++)m[r][k]-=factor*m[c][k];}
  }
  return [...m.map(row=>row[8]),1];
}
export function mapPoint(h,x,y){const d=h[6]*x+h[7]*y+1;return {x:(h[0]*x+h[1]*y+h[2])/d,y:(h[3]*x+h[4]*y+h[5])/d};}
export function validateCorners(c){
  if(!Array.isArray(c)||c.length!==4||c.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))throw Error('四角需位于照片内');
  const area=Math.abs(c.reduce((sum,p,i)=>sum+p.x*c[(i+1)%4].y-p.y*c[(i+1)%4].x,0))/2;
  if(area<.03)throw Error('纸张四角区域太小');
  return c;
}
export async function rectifyA4(bitmap,corners,maxDimension=4096){
  validateCorners(corners);
  const p=corners.map(v=>({x:v.x*bitmap.width,y:v.y*bitmap.height}));
  const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const rawWidth=(length(p[0],p[1])+length(p[3],p[2]))/2;
  const rawHeight=(length(p[0],p[3])+length(p[1],p[2]))/2;
  const size=Math.min(maxDimension,Math.max(300,Math.round(Math.max(rawWidth*297/210,rawHeight))));
  const height=size,width=Math.round(size*210/297);
  // Inverse mapping: every output pixel samples the corresponding source point.
  const h=solveHomography([{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}],p);
  const source=document.createElement('canvas');source.width=bitmap.width;source.height=bitmap.height;
  const sourceCtx=source.getContext('2d',{willReadFrequently:true});sourceCtx.drawImage(bitmap,0,0);
  const src=sourceCtx.getImageData(0,0,source.width,source.height).data;
  const result=document.createElement('canvas');result.width=width;result.height=height;
  const ctx=result.getContext('2d');const frame=ctx.createImageData(width,height),out=frame.data;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const q=mapPoint(h,x+.5,y+.5),sx=clamp(q.x,0,bitmap.width-1.001),sy=clamp(q.y,0,bitmap.height-1.001);
    const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,at=(y*width+x)*4;
    for(let k=0;k<4;k++){
      const a=src[(iy*bitmap.width+ix)*4+k],b=src[(iy*bitmap.width+ix+1)*4+k];
      const c=src[((iy+1)*bitmap.width+ix)*4+k],d=src[((iy+1)*bitmap.width+ix+1)*4+k];
      out[at+k]=(a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;
    }
  }
  ctx.putImageData(frame,0,0);
  return new Promise((resolve,reject)=>result.toBlob(blob=>blob?resolve(blob):reject(Error('校正图像失败')),'image/png'));
}
export async function suggestPaperCorners(bitmap){
  const max=600,ratio=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
  const w=Math.max(1,Math.round(bitmap.width*ratio)),h=Math.max(1,Math.round(bitmap.height*ratio));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,w,h);
  const data=ctx.getImageData(0,0,w,h).data,seen=new Uint8Array(w*h),queue=new Int32Array(w*h);
  let best=null;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const start=y*w+x,p=start*4,bright=Math.min(data[p],data[p+1],data[p+2])>175;
    if(seen[start]||!bright)continue;seen[start]=1;queue[0]=start;
    let tail=1,head=0,minX=x,maxX=x,minY=y,maxY=y;
    while(head<tail){const n=queue[head++],px=n%w,py=(n/w)|0;
      minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
      for(const v of [n-1,n+1,n-w,n+w]){
        if(v<0||v>=w*h||seen[v]||Math.abs(v%w-px)+Math.abs(((v/w)|0)-py)!==1)continue;
        const j=v*4;if(Math.min(data[j],data[j+1],data[j+2])<=175)continue;
        seen[v]=1;queue[tail++]=v;
      }
    }
    if(tail>w*h*.16&&(!best||tail>best.count))best={count:tail,minX,maxX,minY,maxY};
  }
  if(!best)return null;
  const inset=.004;
  return [{x:clamp(best.minX/w,inset,1-inset),y:clamp(best.minY/h,inset,1-inset)},
    {x:clamp(best.maxX/w,inset,1-inset),y:clamp(best.minY/h,inset,1-inset)},
    {x:clamp(best.maxX/w,inset,1-inset),y:clamp(best.maxY/h,inset,1-inset)},
    {x:clamp(best.minX/w,inset,1-inset),y:clamp(best.maxY/h,inset,1-inset)}];
}

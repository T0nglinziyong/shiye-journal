// Foreground evidence for paper-material recognition.
// The proposal is intentionally broad; evidence/seeds stay conservative so
// cast shadows can connect an object's rough proposal without becoming object pixels.

const srgb=Array.from({length:256},(_,i)=>{const v=i/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)];};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function rgbToLab(r,g,b){
  r=srgb[r|0];g=srgb[g|0];b=srgb[b|0];
  const x=(r*.4124564+g*.3575761+b*.1804375)/.95047;
  const y=(r*.2126729+g*.7151522+b*.0721750);
  const z=(r*.0193339+g*.1191920+b*.9503041)/1.08883;
  const f=t=>t>.008856?Math.cbrt(t):(7.787*t+16/116);
  const fx=f(x),fy=f(y),fz=f(z);
  return [116*fy-16,500*(fx-fy),200*(fy-fz)];
}

function globalNeutral(pixels,w,h){
  const channels=[[],[],[]];
  for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){
    if(x>w*.04&&x<w*.96&&y>h*.04&&y<h*.96)continue;
    const p=(y*w+x)*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
    if(max-min<45&&min>105){channels[0].push(r);channels[1].push(g);channels[2].push(b);}
  }
  return channels.map(a=>median(a)||230);
}

function localBackgrounds(pixels,w,h,cell,fallback){
  const cols=Math.ceil(w/cell),rows=Math.ceil(h/cell),background=Array(cols*rows);
  const fallbackMean=(fallback[0]+fallback[1]+fallback[2])/3;
  for(let by=0;by<rows;by++)for(let bx=0;bx<cols;bx++){
    const samples=[[],[],[]];
    for(let y=by*cell;y<Math.min(h,(by+1)*cell);y+=3)for(let x=bx*cell;x<Math.min(w,(bx+1)*cell);x+=3){
      const p=(y*w+x)*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2],min=Math.min(r,g,b),max=Math.max(r,g,b),mean=(r+g+b)/3;
      if(max-min<42&&min>90&&Math.abs(mean-fallbackMean)<42){samples[0].push(r);samples[1].push(g);samples[2].push(b);}
    }
    background[by*cols+bx]=samples[0].length>=10?samples.map(median):fallback;
  }
  return {background,cols,rows};
}

const luma=(pixels,i)=>pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;

export function buildForegroundEvidence(analysisPixels,w,h,{sourcePixels=analysisPixels,cellSize=64}={}){
  if(!analysisPixels||analysisPixels.length!==w*h*4||!sourcePixels||sourcePixels.length!==w*h*4)throw Error('前景分析像素尺寸不匹配');
  const fallback=globalNeutral(analysisPixels,w,h),rawFallback=globalNeutral(sourcePixels,w,h);
  const local=localBackgrounds(analysisPixels,w,h,cellSize,fallback),rawLocal=localBackgrounds(sourcePixels,w,h,cellSize,rawFallback);
  const labBackground=local.background.map(c=>rgbToLab(...c)),rawLabBackground=rawLocal.background.map(c=>rgbToLab(...c));
  const mask=new Uint8Array(w*h),evidence=new Uint8Array(w*h),foregroundSeeds=new Uint8Array(w*h),shadowLikelihood=new Uint8Array(w*h),score=new Uint8Array(w*h);

  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,p=i*4;if(analysisPixels[p+3]<=20)continue;
    const cell=Math.floor(y/cellSize)*local.cols+Math.floor(x/cellSize);
    const lab=rgbToLab(analysisPixels[p],analysisPixels[p+1],analysisPixels[p+2]),rawLab=rgbToLab(sourcePixels[p],sourcePixels[p+1],sourcePixels[p+2]);
    const bg=labBackground[cell],rawBg=rawLabBackground[cell];
    const dL=lab[0]-bg[0],dA=rawLab[1]-rawBg[1],dB=rawLab[2]-rawBg[2],chroma=Math.hypot(dA,dB),absL=Math.abs(dL);
    const xl=Math.max(0,x-1),xr=Math.min(w-1,x+1),yt=Math.max(0,y-1),yb=Math.min(h-1,y+1);
    const left=luma(sourcePixels,(y*w+xl)*4),right=luma(sourcePixels,(y*w+xr)*4),top=luma(sourcePixels,(yt*w+x)*4),bottom=luma(sourcePixels,(yb*w+x)*4),center=luma(sourcePixels,p);
    const edge=Math.hypot(right-left,bottom-top)*.5;
    const texture=Math.abs(center-(left+right+top+bottom)/4);
    // Smooth low-chroma darkening is characteristic of cast illumination.
    // Keep it in the rough proposal, but mark it as probable background for GrabCut.
    const shadow=dL<-4&&chroma<5.5&&texture<7.5;
    const proposal=chroma>4.2||absL>5.5||edge>11||texture>4.5;
    const strongColor=chroma>8.5;
    const strongInk=dL<-24&&texture>7;
    const strongLight=dL>18&&edge>10;
    const edgeTexture=edge>16&&texture>5.5;
    const realEvidence=!shadow&&(strongColor||strongInk||strongLight||edgeTexture);
    const seed=!shadow&&(chroma>11||dL<-31&&texture>9||dL>24&&edge>13);
    mask[i]=proposal?1:0;evidence[i]=realEvidence?1:0;foregroundSeeds[i]=seed?1:0;shadowLikelihood[i]=shadow?1:0;
    score[i]=clamp(Math.round(chroma*6+absL*2+edge*.9+texture*2-(shadow?35:0)),0,255);
  }
  return {mask,evidence,foregroundSeeds,shadowLikelihood,score};
}

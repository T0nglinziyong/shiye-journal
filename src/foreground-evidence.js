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
  const fallbackMean=(fallback[0]+fallback[1]+fallback[2])/3,fallbackChroma=fallback.map(v=>v-fallbackMean);
  for(let by=0;by<rows;by++)for(let bx=0;bx<cols;bx++){
    const samples=[[],[],[]];
    for(let y=by*cell;y<Math.min(h,(by+1)*cell);y+=3)for(let x=bx*cell;x<Math.min(w,(bx+1)*cell);x+=3){
      const p=(y*w+x)*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2],min=Math.min(r,g,b),mean=(r+g+b)/3;
      // Illumination changes the common RGB level much more than channel
      // ratios. Compare chroma direction to the page reference so a neutral
      // cast shadow may become local background while pale blue/yellow paper
      // cannot teach the background model its colour.
      const chromaResidual=Math.max(Math.abs((r-mean)-fallbackChroma[0]),Math.abs((g-mean)-fallbackChroma[1]),Math.abs((b-mean)-fallbackChroma[2]));
      if(chromaResidual<10&&min>80&&Math.abs(mean-fallbackMean)<46){samples[0].push(r);samples[1].push(g);samples[2].push(b);}
    }
    background[by*cols+bx]=samples[0].length>=10?samples.map(median):fallback;
  }
  return {background,cols,rows};
}

const luma=(pixels,i)=>pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;

export function backgroundConnectedMask({labL,labA,labB,edge,evidence,shadowLikelihood,width:w,height:h,paperA,paperB,chromaThreshold=6,edgeThreshold=13,stepThreshold=7}){
  const background=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
  const passable=i=>{
    if(evidence[i])return false;
    const chroma=Math.hypot(labA[i]-paperA,labB[i]-paperB);
    return !!shadowLikelihood[i]||chroma<=chromaThreshold&&edge[i]<=edgeThreshold;
  };
  const push=i=>{if(!background[i]&&passable(i)){background[i]=1;queue[tail++]=i;}};
  // App invariant: materials are never placed flush against the rectified A4
  // frame. Treat the outer ~3 mm as known background, not merely as a place
  // from which background is guessed. This makes warp interpolation, paper
  // edge lines and a shadowed corner harmless to the flood-fill seed.
  const pxPerMM=Math.max(.5,((w/210)+(h/297))/2),safeBand=Math.max(2,Math.round(pxPerMM*3.0));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x<safeBand||y<safeBand||x>=w-safeBand||y>=h-safeBand)background[y*w+x]=1;
  const seedY0=Math.min(h-1,safeBand),seedY1=Math.max(0,h-1-safeBand),seedX0=Math.min(w-1,safeBand),seedX1=Math.max(0,w-1-safeBand);
  for(let x=seedX0;x<=seedX1;x++){push(seedY0*w+x);push(seedY1*w+x);}
  for(let y=seedY0;y<=seedY1;y++){push(y*w+seedX0);push(y*w+seedX1);}
  const offsets=[-1,1,-w,w,-w-1,-w+1,w-1,w+1];
  while(head<tail){
    const at=queue[head++],x=at%w,y=(at/w)|0;
    for(const d of offsets){
      const next=at+d;if(next<0||next>=w*h||background[next]||!passable(next))continue;
      const nx=next%w,ny=(next/w)|0;if(Math.abs(nx-x)>1||Math.abs(ny-y)>1)continue;
      const dL=labL[next]-labL[at],dA=labA[next]-labA[at],dB=labB[next]-labB[at],step=Math.hypot(dL,dA,dB);
      // Smooth illumination may move farther in L than a single threshold;
      // an explicit shadow cue may therefore cross a larger luminance step.
      if(step<=stepThreshold||shadowLikelihood[next]){background[next]=1;queue[tail++]=next;}
    }
  }
  return background;
}

export function buildForegroundEvidence(analysisPixels,w,h,{sourcePixels=analysisPixels,cellSize=64}={}){
  if(!analysisPixels||analysisPixels.length!==w*h*4||!sourcePixels||sourcePixels.length!==w*h*4)throw Error('前景分析像素尺寸不匹配');
  const fallback=globalNeutral(analysisPixels,w,h),rawFallback=globalNeutral(sourcePixels,w,h),rawFallbackLab=rgbToLab(...rawFallback);
  const local=localBackgrounds(analysisPixels,w,h,cellSize,fallback),rawLocal=localBackgrounds(sourcePixels,w,h,cellSize,rawFallback);
  const labBackground=local.background.map(c=>rgbToLab(...c)),rawLabBackground=rawLocal.background.map(c=>rgbToLab(...c));
  const proposal=new Uint8Array(w*h),evidence=new Uint8Array(w*h),foregroundSeeds=new Uint8Array(w*h),shadowLikelihood=new Uint8Array(w*h),score=new Uint8Array(w*h);
  const labL=new Float32Array(w*h),labA=new Float32Array(w*h),labB=new Float32Array(w*h),edgeField=new Float32Array(w*h);

  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,p=i*4;if(analysisPixels[p+3]<=20)continue;
    const cell=Math.floor(y/cellSize)*local.cols+Math.floor(x/cellSize);
    const lab=rgbToLab(analysisPixels[p],analysisPixels[p+1],analysisPixels[p+2]),rawLab=rgbToLab(sourcePixels[p],sourcePixels[p+1],sourcePixels[p+2]);
    labL[i]=rawLab[0];labA[i]=rawLab[1];labB[i]=rawLab[2];
    const bg=labBackground[cell],rawBg=rawLabBackground[cell];
    const dL=lab[0]-bg[0],dA=rawLab[1]-rawBg[1],dB=rawLab[2]-rawBg[2],chroma=Math.hypot(dA,dB),absL=Math.abs(dL);
    const xl=Math.max(0,x-1),xr=Math.min(w-1,x+1),yt=Math.max(0,y-1),yb=Math.min(h-1,y+1);
    const left=luma(sourcePixels,(y*w+xl)*4),right=luma(sourcePixels,(y*w+xr)*4),top=luma(sourcePixels,(yt*w+x)*4),bottom=luma(sourcePixels,(yb*w+x)*4),center=luma(sourcePixels,p);
    const edge=Math.hypot(right-left,bottom-top)*.5,texture=Math.abs(center-(left+right+top+bottom)/4);edgeField[i]=edge;
    const shadow=dL<-4&&chroma<5.5&&texture<7.5;
    const candidate=chroma>4.2||absL>5.5||edge>11||texture>4.5;
    const strongColor=chroma>8.5,strongInk=dL<-24&&texture>7,strongLight=dL>18&&edge>10,edgeTexture=edge>16&&texture>5.5;
    const realEvidence=!shadow&&(strongColor||strongInk||strongLight||edgeTexture),seed=!shadow&&(chroma>11||dL<-31&&texture>9||dL>24&&edge>13);
    proposal[i]=candidate?1:0;evidence[i]=realEvidence?1:0;foregroundSeeds[i]=seed?1:0;shadowLikelihood[i]=shadow?1:0;
    score[i]=clamp(Math.round(chroma*6+absL*2+edge*.9+texture*2-(shadow?35:0)),0,255);
  }

  const backgroundConnected=backgroundConnectedMask({
    labL,labA,labB,edge:edgeField,evidence,shadowLikelihood,width:w,height:h,
    paperA:rawFallbackLab[1],paperB:rawFallbackLab[2]
  });
  const mask=new Uint8Array(w*h),pxPerMM=Math.max(.5,((w/210)+(h/297))/2),safeBand=Math.max(2,Math.round(pxPerMM*3.0));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,protectedFrame=x<safeBand||y<safeBand||x>=w-safeBand||y>=h-safeBand;
    if(protectedFrame){
      // The app guarantees that no valid material is placed here. Override
      // even strong warp/paper-edge evidence so frame artifacts can never be
      // resurrected as foreground later in the pipeline.
      mask[i]=proposal[i]=evidence[i]=foregroundSeeds[i]=score[i]=0;shadowLikelihood[i]=0;backgroundConnected[i]=1;continue;
    }
    // The complement of page-connected background preserves pale/white
    // material interiors behind a real perimeter. Strong evidence is always
    // retained even if a tiny boundary gap lets the background flood through.
    mask[i]=!backgroundConnected[i]||evidence[i]?1:0;
  }
  return {mask,proposal,evidence,foregroundSeeds,shadowLikelihood,backgroundConnected,score};
}

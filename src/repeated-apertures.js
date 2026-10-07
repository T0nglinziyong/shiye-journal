// Precision-first recovery of manufactured repeated apertures.
//
// This postprocessor runs AFTER the outer carrier is finalized by MorphGAC +
// shape regularization. It never changes the outer boundary and never invents
// an isolated hole.
//
// Acceptance policy:
// - local pixels at the candidate centre must resemble the surrounding A4;
// - a real circular image edge must support the rim;
// - the annulus outside the rim must still look like material;
// - at least FOUR mutually-consistent circles must form one near-linear,
//   near-equal-radius, near-equal-spacing manufacturing pattern;
// - the row must stay physically near one carrier edge.
//
// False apertures are deliberately more expensive than missed apertures.

const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const median=a=>{
  if(!a.length)return 0;
  const b=[...a].sort((x,y)=>x-y);
  return b[(b.length/2)|0];
};
const std=a=>{
  if(!a.length)return 0;
  const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));
};
const cvv=a=>std(a)/Math.max(1e-6,mean(a));
const odd=n=>{n=Math.max(3,Math.round(n));return n&1?n:n+1;};

function paperDistance(lab,i,ref){
  const at=i*3,dL=(lab.data[at]-ref.L)/2,da=lab.data[at+1]-ref.a,db=lab.data[at+2]-ref.b;
  return Math.hypot(dL,da,db);
}

function localPaperReference(cv,carrier,lab,pxPerMM){
  const innerK=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(odd(pxPerMM*2.0+1),odd(pxPerMM*2.0+1))),
    outerK=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(odd(pxPerMM*10+1),odd(pxPerMM*10+1))),
    inner=new cv.Mat(),outer=new cv.Mat(),ring=new cv.Mat();
  cv.dilate(carrier,inner,innerK);cv.dilate(carrier,outer,outerK);cv.subtract(outer,inner,ring);
  const L=[],A=[],B=[],step=Math.max(1,Math.round(pxPerMM*.7));
  for(let y=0;y<carrier.rows;y+=step)for(let x=0;x<carrier.cols;x+=step){
    const i=y*carrier.cols+x;if(!ring.data[i])continue;
    const at=i*3;L.push(lab.data[at]);A.push(lab.data[at+1]);B.push(lab.data[at+2]);
  }
  innerK.delete();outerK.delete();inner.delete();outer.delete();ring.delete();
  if(L.length<20)return null;
  return {L:median(L),a:median(A),b:median(B)};
}

function plausiblePageLikeCount(cv,carrier,lab,ref,pxPerMM){
  const pageLike=cv.Mat.zeros(carrier.rows,carrier.cols,cv.CV_8UC1);
  for(let y=1;y<carrier.rows-1;y++)for(let x=1;x<carrier.cols-1;x++){
    const i=y*carrier.cols+x;
    if(carrier.data[i]&&paperDistance(lab,i,ref)<=12)pageLike.data[i]=255;
  }
  const k=odd(pxPerMM*.4),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)),clean=new cv.Mat();
  cv.morphologyEx(pageLike,clean,cv.MORPH_OPEN,kernel);cv.morphologyEx(clean,clean,cv.MORPH_CLOSE,kernel);
  const labels=new cv.Mat(),stats=new cv.Mat(),centroids=new cv.Mat();
  const n=cv.connectedComponentsWithStats(clean,labels,stats,centroids,8,cv.CV_32S);
  let count=0;
  for(let label=1;label<n;label++){
    const base=label*5,w=stats.data32S[base+2],h=stats.data32S[base+3],area=stats.data32S[base+4];
    if(area<8)continue;
    const r=Math.sqrt(area/Math.PI),aspect=Math.min(w,h)/Math.max(1,Math.max(w,h));
    if(r>=pxPerMM*1.5&&r<=pxPerMM*4.2&&aspect>=.55)count++;
  }
  pageLike.delete();kernel.delete();clean.delete();labels.delete();stats.delete();centroids.delete();
  return count;
}

function circleCandidates(cv,carrier,gray,lab,ref,pxPerMM){
  const blur=new cv.Mat(),edges=new cv.Mat(),support=new cv.Mat(),dist=new cv.Mat(),circles=new cv.Mat();
  cv.medianBlur(gray,blur,5);cv.Canny(blur,edges,20,70);
  const supportK=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5));cv.dilate(edges,support,supportK);
  cv.distanceTransform(carrier,dist,cv.DIST_L2,5);
  cv.HoughCircles(
    blur,circles,cv.HOUGH_GRADIENT,1,
    Math.max(6,Math.round(pxPerMM*2.5)),
    60,9,
    Math.max(2,Math.round(pxPerMM*.8)),
    Math.max(4,Math.round(pxPerMM*5.2))
  );
  const out=[];
  for(let i=0;i+2<circles.data32F.length;i+=3){
    const x=Math.round(circles.data32F[i]),y=Math.round(circles.data32F[i+1]),r=Math.round(circles.data32F[i+2]);
    if(x<0||x>=carrier.cols||y<0||y>=carrier.rows||!carrier.data[y*carrier.cols+x])continue;
    if(r<pxPerMM*1.5||r>pxPerMM*4.2)continue;
    const edgeDistance=dist.data32F[y*carrier.cols+x],ratio=edgeDistance/Math.max(1,r);
    if(ratio<.8||ratio>5.0)continue;

    let edgeHits=0;const samples=56;
    for(let k=0;k<samples;k++){
      const t=k*Math.PI*2/samples,xx=Math.round(x+Math.cos(t)*r),yy=Math.round(y+Math.sin(t)*r);
      if(xx>=0&&xx<carrier.cols&&yy>=0&&yy<carrier.rows&&support.data[yy*carrier.cols+xx])edgeHits++;
    }
    const edgeSupport=edgeHits/samples;if(edgeSupport<.70)continue;

    const inner=[],rr=Math.ceil(r*1.7);let ringN=0,ringMaterial=0;
    for(let yy=Math.max(0,y-rr);yy<=Math.min(carrier.rows-1,y+rr);yy+=2)for(let xx=Math.max(0,x-rr);xx<=Math.min(carrier.cols-1,x+rr);xx+=2){
      const d=Math.hypot(xx-x,yy-y),at=yy*carrier.cols+xx,pd=paperDistance(lab,at,ref);
      if(d<=r*.55)inner.push(pd);
      else if(d>=r*1.12&&d<=r*1.65){
        ringN++;
        if(carrier.data[at]&&pd>6)ringMaterial++;
      }
    }
    if(!inner.length||!ringN)continue;
    const pageLike=median(inner),ringMaterialFraction=ringMaterial/ringN;
    if(pageLike>20||ringMaterialFraction<.90)continue;
    out.push({x,y,r,edgeDistance,edgeSupport,pageDistance:pageLike,ringMaterialFraction});
  }
  blur.delete();edges.delete();support.delete();dist.delete();circles.delete();supportK.delete();
  return out;
}

function selectRepeatedAperturePattern(candidates,pxPerMM){
  let best=null;
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
    const a=candidates[i],b=candidates[j],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<pxPerMM*5)continue;
    const ux=dx/len,uy=dy/len,nx=-uy,ny=ux,medR=(a.r+b.r)/2,
      group=candidates.filter(q=>{
        const perp=Math.abs((q.x-a.x)*nx+(q.y-a.y)*ny);
        return perp<=Math.max(pxPerMM*1.3,medR*.7)&&q.r/medR>=.65&&q.r/medR<=1.5;
      });
    if(group.length<4)continue;
    const projected=group.map(q=>({t:(q.x-a.x)*ux+(q.y-a.y)*uy,q})).sort((p,q)=>p.t-q.t),dedup=[];
    for(const z of projected){
      if(!dedup.length||z.t-dedup[dedup.length-1].t>Math.max(pxPerMM*3,medR*1.3))dedup.push(z);
      else{
        const prev=dedup[dedup.length-1].q,
          nowScore=z.q.edgeSupport+z.q.ringMaterialFraction-z.q.pageDistance/30,
          prevScore=prev.edgeSupport+prev.ringMaterialFraction-prev.pageDistance/30;
        if(nowScore>prevScore)dedup[dedup.length-1]=z;
      }
    }
    if(dedup.length<4)continue;
    const qs=dedup.map(z=>z.q),spacing=[];for(let k=1;k<dedup.length;k++)spacing.push(dedup[k].t-dedup[k-1].t);
    const radii=qs.map(q=>q.r),edgeDistances=qs.map(q=>q.edgeDistance),baseSpacing=median(spacing);
    if(cvv(radii)>.25||cvv(edgeDistances)>.35||median(edgeDistances)>pxPerMM*10||baseSpacing<3*mean(radii))continue;
    let missing=null,bad=false,doubled=0;
    for(let k=0;k<spacing.length;k++){
      const ratio=spacing[k]/Math.max(1e-6,baseSpacing);
      if(ratio>=.72&&ratio<=1.35)continue;
      if(ratio>=1.70&&ratio<=2.35&&doubled===0){
        doubled++;
        const left=dedup[k].q,right=dedup[k+1].q;
        missing={x:Math.round((left.x+right.x)/2),y:Math.round((left.y+right.y)/2),r:Math.round(median(radii))};
      }else{bad=true;break;}
    }
    if(bad||dedup[dedup.length-1].t-dedup[0].t<pxPerMM*12)continue;
    const score=qs.length*3+mean(qs.map(q=>q.edgeSupport))+mean(qs.map(q=>q.ringMaterialFraction))
      -cvv(radii)-mean(qs.map(q=>q.pageDistance))/30-(missing?.5:0);
    if(!best||score>best.score)best={score,items:qs,missing};
  }
  return best||{items:[],missing:null};
}
export function selectRepeatedApertureGroup(candidates,pxPerMM){
  return selectRepeatedAperturePattern(candidates,pxPerMM).items;
}
function validatePredictedHole(cv,carrier,gray,lab,ref,q){
  const {x,y,r}=q;
  if(x<r+1||y<r+1||x>=carrier.cols-r-1||y>=carrier.rows-r-1||!carrier.data[y*carrier.cols+x])return null;
  const blur=new cv.Mat(),edges=new cv.Mat(),support=new cv.Mat(),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5));
  cv.medianBlur(gray,blur,5);cv.Canny(blur,edges,20,70);cv.dilate(edges,support,kernel);
  let edge=0,inside=0;const samples=56;
  for(let n=0;n<samples;n++){const t=n*Math.PI*2/samples,xx=Math.round(x+Math.cos(t)*r),yy=Math.round(y+Math.sin(t)*r);if(support.data[yy*carrier.cols+xx])edge++;if(carrier.data[yy*carrier.cols+xx])inside++;}
  const center=[];
  for(let yy=Math.max(0,y-Math.ceil(r*.55));yy<=Math.min(carrier.rows-1,y+Math.ceil(r*.55));yy+=2)
    for(let xx=Math.max(0,x-Math.ceil(r*.55));xx<=Math.min(carrier.cols-1,x+Math.ceil(r*.55));xx+=2)
      if(Math.hypot(xx-x,yy-y)<=r*.55)center.push(paperDistance(lab,yy*carrier.cols+xx,ref));
  blur.delete();edges.delete();support.delete();kernel.delete();
  return edge/samples>=.55&&inside/samples>=.80&&center.length&&median(center)<=20?{...q,edgeSupport:edge/samples,pageDistance:median(center),inferred:true}:null;
}
function restoreOne(cv,rgba,pageW,pageH,candidate,paperWidthMM,paperHeightMM){
  const m=candidate.mask;
  if(!m?.alpha?.length||m.width<2||m.height<2)return {...candidate,apertureCount:0};
  const pxPerMM=Math.max(.5,((pageW/paperWidthMM)+(pageH/paperHeightMM))/2),
    gx=Math.max(0,Math.round(candidate.x*pageW)),gy=Math.max(0,Math.round(candidate.y*pageH)),
    gw=Math.max(1,Math.min(pageW-gx,Math.round(candidate.w*pageW))),gh=Math.max(1,Math.min(pageH-gy,Math.round(candidate.h*pageH))),
    pad=Math.max(5,Math.round(pxPerMM*5)),
    x0=Math.max(0,gx-pad),y0=Math.max(0,gy-pad),x1=Math.min(pageW,gx+gw+pad),y1=Math.min(pageH,gy+gh+pad),
    rw=x1-x0,rh=y1-y0,ox=gx-x0,oy=gy-y0,
    image=rgba.roi(new cv.Rect(x0,y0,rw,rh)),rgb=new cv.Mat(),lab=new cv.Mat(),gray=new cv.Mat(),
    carrier=cv.Mat.zeros(rh,rw,cv.CV_8UC1),
    source=cv.matFromArray(m.height,m.width,cv.CV_8UC1,m.alpha),scaled=new cv.Mat();
  cv.cvtColor(image,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.cvtColor(image,gray,cv.COLOR_RGBA2GRAY);
  cv.resize(source,scaled,new cv.Size(gw,gh),0,0,cv.INTER_NEAREST);
  const target=carrier.roi(new cv.Rect(ox,oy,gw,gh));scaled.copyTo(target);target.delete();

  const ref=localPaperReference(cv,carrier,lab,pxPerMM);
  if(!ref||plausiblePageLikeCount(cv,carrier,lab,ref,pxPerMM)<3){
    source.delete();scaled.delete();carrier.delete();gray.delete();lab.delete();rgb.delete();image.delete();
    return {...candidate,apertureCount:0};
  }

  const circles=circleCandidates(cv,carrier,gray,lab,ref,pxPerMM),
    pattern=selectRepeatedAperturePattern(circles,pxPerMM),group=[...pattern.items],
    inferred=pattern.missing?validatePredictedHole(cv,carrier,gray,lab,ref,pattern.missing):null;
  if(inferred)group.push(inferred);
  if(group.length>=4){
    const radius=Math.max(1,Math.round(median(group.map(q=>q.r))+pxPerMM*.33));
    for(const q of group)cv.circle(carrier,new cv.Point(q.x,q.y),radius,new cv.Scalar(0),cv.FILLED);

    const local=carrier.roi(new cv.Rect(ox,oy,gw,gh)),packed=new cv.Mat();local.copyTo(packed);
    const regions=group.map(q=>({
      x:(x0+q.x-radius)/pageW,y:(y0+q.y-radius)/pageH,
      w:(radius*2+1)/pageW,h:(radius*2+1)/pageH,
      radiusPX:radius,source:q.inferred?'repeated-hole-edge-recovered':'repeated-manufactured-hole'
    }));
    const result={
      ...candidate,
      pixels:cv.countNonZero(local),
      apertureCount:group.length,
      apertureRegions:regions,
      mask:{...m,width:gw,height:gh,alpha:new Uint8Array(packed.data),topologyPreserved:true,apertureRegions:regions}
    };
    packed.delete();local.delete();source.delete();scaled.delete();carrier.delete();gray.delete();lab.delete();rgb.delete();image.delete();
    return result;
  }

  source.delete();scaled.delete();carrier.delete();gray.delete();lab.delete();rgb.delete();image.delete();
  return {...candidate,apertureCount:0};
}

export function restoreRepeatedApertures(cv,p){
  const pageW=p.width,pageH=p.height,paperWidthMM=p.paperWidthMM||210,paperHeightMM=p.paperHeightMM||297,
    rgba=cv.matFromArray(pageH,pageW,cv.CV_8UC4,p.pixels),out=[];
  try{
    for(const candidate of p.candidates||[])out.push(restoreOne(cv,rgba,pageW,pageH,candidate,paperWidthMM,paperHeightMM));
    return out;
  }finally{rgba.delete();}
}

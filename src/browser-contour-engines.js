// Browser contour refiners derived from scikit-image's BSD-3-Clause reference
// implementations of active_contour and morphological_geodesic_active_contour.
// Source snapshot: scikit-image/scikit-image@533b7694d2004ae84e49e2cfd0bcfc5f8e562f22
//
// The numerical solver and morphological evolution follow the upstream
// equations. Browser-specific substitutions are intentionally narrow:
// - OpenCV.js supplies Sobel/Gaussian/morphology/matrix inversion.
// - image-force derivatives are sampled bilinearly from the Sobel derivative
//   fields instead of SciPy RectBivariateSpline derivatives.
// - Shiye supplies only ROI/initialization and confidence routing; those are
//   white-A4 domain priors, not changes to the contour evolution itself.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const percentile=(values,q)=>{const a=Array.from(values).sort((x,y)=>x-y);return a.length?a[Math.min(a.length-1,Math.max(0,Math.floor((a.length-1)*q)))]:0;};
const matPoints=c=>Array.from({length:c.rows},(_,i)=>[c.data32S[i*2],c.data32S[i*2+1]]);

function largestExternal(cv,mask){
  const cs=new cv.MatVector(),hh=new cv.Mat();cv.findContours(mask,cs,hh,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let best=null,area=0;for(let i=0;i<cs.size();i++){const c=cs.get(i),a=Math.abs(cv.contourArea(c));if(a>area){best?.delete?.();best=c;area=a;}else c.delete();}
  cs.delete();hh.delete();return {contour:best,area};
}
function maskFromContour(cv,c,w,h){const m=cv.Mat.zeros(h,w,cv.CV_8UC1),v=new cv.MatVector();v.push_back(c);cv.drawContours(m,v,-1,new cv.Scalar(255),cv.FILLED);v.delete();return m;}
function candidateROI(cv,p,padMM=5){
  const {candidate,width:w,height:h}=p,pxPerMM=p.pxPerMM||Math.max(.5,((w/(p.paperWidthMM||210))+(h/(p.paperHeightMM||297)))/2);
  const x=Math.max(0,Math.round(candidate.x*w)),y=Math.max(0,Math.round(candidate.y*h)),bw=Math.max(1,Math.min(w-x,Math.round(candidate.w*w))),bh=Math.max(1,Math.min(h-y,Math.round(candidate.h*h)));
  const pad=Math.max(4,Math.round(pxPerMM*padMM)),rx=Math.max(0,x-pad),ry=Math.max(0,y-pad),rr=Math.min(w,x+bw+pad),rb=Math.min(h,y+bh+pad),rw=rr-rx,rh=rb-ry;
  const local=cv.Mat.zeros(rh,rw,cv.CV_8UC1);
  if(candidate.mask?.alpha){
    const src=cv.matFromArray(candidate.mask.height,candidate.mask.width,cv.CV_8UC1,candidate.mask.alpha),scaled=new cv.Mat();cv.resize(src,scaled,new cv.Size(bw,bh),0,0,cv.INTER_NEAREST);const target=local.roi(new cv.Rect(x-rx,y-ry,bw,bh));scaled.copyTo(target);target.delete();src.delete();scaled.delete();
  }else{const target=local.roi(new cv.Rect(x-rx,y-ry,bw,bh));target.setTo(new cv.Scalar(255));target.delete();}
  return {x,y,bw,bh,rx,ry,rw,rh,pxPerMM,initial:local};
}
function rgbaROI(cv,p,r){const full=cv.matFromArray(p.height,p.width,cv.CV_8UC4,p.pixels),view=full.roi(new cv.Rect(r.rx,r.ry,r.rw,r.rh)),out=new cv.Mat();view.copyTo(out);view.delete();full.delete();return out;}
function boundaryFeature(cv,rgba){
  const rgb=new cv.Mat(),gray8=new cv.Mat(),gray=new cv.Mat(),blur=new cv.Mat(),gx=new cv.Mat(),gy=new cv.Mat(),gmag=new cv.Mat();
  cv.cvtColor(rgba,gray8,cv.COLOR_RGBA2GRAY);gray8.convertTo(gray,cv.CV_32F,1/255);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);cv.Sobel(blur,gx,cv.CV_32F,1,0,3);cv.Sobel(blur,gy,cv.CV_32F,0,1,3);cv.magnitude(gx,gy,gmag);
  cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);const lab=new cv.Mat(),channels=new cv.MatVector();cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);const aa=channels.get(1),bb=channels.get(2),af=new cv.Mat(),bf=new cv.Mat(),ax=new cv.Mat(),ay=new cv.Mat(),bx=new cv.Mat(),by=new cv.Mat(),amag=new cv.Mat(),bmag=new cv.Mat();aa.convertTo(af,cv.CV_32F,1/255);bb.convertTo(bf,cv.CV_32F,1/255);cv.Sobel(af,ax,cv.CV_32F,1,0,3);cv.Sobel(af,ay,cv.CV_32F,0,1,3);cv.Sobel(bf,bx,cv.CV_32F,1,0,3);cv.Sobel(bf,by,cv.CV_32F,0,1,3);cv.magnitude(ax,ay,amag);cv.magnitude(bx,by,bmag);
  const edge=new cv.Mat(gmag.rows,gmag.cols,cv.CV_32F);let max=1e-6;for(let i=0;i<edge.data32F.length;i++){const v=gmag.data32F[i]+.32*(amag.data32F[i]+bmag.data32F[i]);edge.data32F[i]=v;if(v>max)max=v;}for(let i=0;i<edge.data32F.length;i++)edge.data32F[i]/=max;
  rgb.delete();gray8.delete();gray.delete();blur.delete();gx.delete();gy.delete();gmag.delete();lab.delete();channels.delete();aa.delete();bb.delete();af.delete();bf.delete();ax.delete();ay.delete();bx.delete();by.delete();amag.delete();bmag.delete();
  return edge;
}
function resampleClosed(points,n){
  if(points.length<3)return points;const seg=[],cum=[0];let total=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],d=Math.hypot(b[0]-a[0],b[1]-a[1]);seg.push(d);total+=d;cum.push(total);}const out=[];let e=0;for(let k=0;k<n;k++){const target=k*total/n;while(e<seg.length-1&&cum[e+1]<target)e++;const a=points[e],b=points[(e+1)%points.length],d=Math.max(seg[e],1e-9),t=(target-cum[e])/d;out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}return out;
}
function expandPoints(points,margin,w,h){const cx=points.reduce((s,p)=>s+p[0],0)/points.length,cy=points.reduce((s,p)=>s+p[1],0)/points.length;return points.map(([x,y])=>{const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy)||1;return [clamp(x+dx/d*margin,1,w-2),clamp(y+dy/d*margin,1,h-2)];});}
function bilinear(data,w,h,x,y){x=clamp(x,0,w-1.001);y=clamp(y,0,h-1.001);const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),tx=x-x0,ty=y-y0;return data[y0*w+x0]*(1-tx)*(1-ty)+data[y0*w+x1]*tx*(1-ty)+data[y1*w+x0]*(1-tx)*ty+data[y1*w+x1]*tx*ty;}
const inverseCache=new Map();
function snakeInverse(cv,n,alpha,beta,gamma){const key=[n,alpha,beta,gamma].join(':');if(inverseCache.has(key))return inverseCache.get(key);const a=new Float64Array(n*n);const at=(i,j,v)=>{a[i*n+((j%n)+n)%n]+=v;};for(let i=0;i<n;i++){at(i,i,2*alpha+6*beta+gamma);at(i,i-1,-alpha-4*beta);at(i,i+1,-alpha-4*beta);at(i,i-2,beta);at(i,i+2,beta);}const m=cv.matFromArray(n,n,cv.CV_64FC1,Array.from(a)),inv=new cv.Mat();cv.invert(m,inv,cv.DECOMP_LU);const out=Float64Array.from(inv.data64F);m.delete();inv.delete();inverseCache.set(key,out);return out;}
function mv(mat,v,n){const out=new Float64Array(n);for(let i=0;i<n;i++){let s=0,off=i*n;for(let j=0;j<n;j++)s+=mat[off+j]*v[j];out[i]=s;}return out;}
function contourMaskFromPoints(cv,pts,w,h){const ints=pts.flatMap(([x,y])=>[Math.round(x),Math.round(y)]),c=cv.matFromArray(pts.length,1,cv.CV_32SC2,ints),m=maskFromContour(cv,c,w,h);c.delete();return m;}
function scoreMask(cv,mask,seed,feature){
  const seedArea=Math.max(1,cv.countNonZero(seed)),inter=new cv.Mat();cv.bitwise_and(mask,seed,inter);const coverage=cv.countNonZero(inter)/seedArea;inter.delete();const found=largestExternal(cv,mask);if(!found.contour)return {score:0,coverage,edgeSupport:0,areaRatio:0};const boundary=cv.Mat.zeros(mask.rows,mask.cols,cv.CV_8UC1),v=new cv.MatVector();v.push_back(found.contour);cv.drawContours(boundary,v,-1,new cv.Scalar(255),1);v.delete();let sum=0,n=0;for(let i=0;i<boundary.data.length;i++)if(boundary.data[i]){sum+=feature.data32F[i];n++;}const edgeSupport=n?sum/n:0,areaRatio=cv.countNonZero(mask)/seedArea,areaPenalty=Math.exp(-Math.abs(Math.log(Math.max(areaRatio,1e-5)/1.12))*.55),score=edgeSupport*.55+coverage*.30+areaPenalty*.15;found.contour.delete();boundary.delete();return {score,coverage,edgeSupport,areaRatio};
}
function preserveTopology(cv,p,r,outer){
  // Refiners own only the OUTER physical boundary. Existing aperture pixels in
  // the authoritative candidate alpha stay unchanged. Recover them as
  // (filled external support - original candidate) rather than recreating
  // holes from bounding boxes, which would turn round/irregular holes into
  // rectangles.
  const found=largestExternal(cv,r.initial);if(!found.contour)return outer;
  const filled=maskFromContour(cv,found.contour,r.rw,r.rh),holes=new cv.Mat();cv.subtract(filled,r.initial,holes);outer.setTo(new cv.Scalar(0),holes);
  found.contour.delete();filled.delete();holes.delete();return outer;
}
function regionResult(cv,p,r,mask,method,metrics){const found=largestExternal(cv,mask);if(!found.contour)return null;const b=cv.boundingRect(found.contour),x=r.rx+b.x,y=r.ry+b.y,w=b.width,h=b.height,local=mask.roi(new cv.Rect(b.x,b.y,w,h)),packed=new cv.Mat();local.copyTo(packed);const poly=matPoints(found.contour).map(([px,py])=>[px-b.x,py-b.y]);const result={x:x/p.width,y:y/p.height,w:w/p.width,h:h/p.height,pixels:cv.countNonZero(local),edgeMethod:method,refinementMetrics:metrics,mask:{width:w,height:h,alpha:new Uint8Array(packed.data),polygons:[poly],topologyPreserved:true,apertureRegions:p.candidate.mask?.apertureRegions||[]}};found.contour.delete();local.delete();packed.delete();return result;}

export function refineActiveContour(cv,p){
  const r=candidateROI(cv,p,5),rgba=rgbaROI(cv,p,r),feature=boundaryFeature(cv,rgba),found=largestExternal(cv,r.initial);if(!found.contour){rgba.delete();feature.delete();r.initial.delete();return null;}const n=clamp(Math.round(cv.arcLength(found.contour,true)/(r.pxPerMM*.9)),64,160),initial=expandPoints(resampleClosed(matPoints(found.contour),n),Math.max(1,r.pxPerMM*1.2),r.rw,r.rh);found.contour.delete();
  const gx=new cv.Mat(),gy=new cv.Mat();cv.Sobel(feature,gx,cv.CV_32F,1,0,3);cv.Sobel(feature,gy,cv.CV_32F,0,1,3);const alpha=p.alpha??.015,beta=p.beta??.12,gamma=p.gamma??.02,maxMove=p.maxPxMove??1,maxIter=p.maxNumIter??180,conv=p.convergence??.08,inv=snakeInverse(cv,n,alpha,beta,gamma),x=Float64Array.from(initial,q=>q[0]),y=Float64Array.from(initial,q=>q[1]),xsave=Array.from({length:10},()=>new Float64Array(n)),ysave=Array.from({length:10},()=>new Float64Array(n));
  for(let it=0;it<maxIter;it++){const rhsX=new Float64Array(n),rhsY=new Float64Array(n);for(let i=0;i<n;i++){rhsX[i]=gamma*x[i]+bilinear(gx.data32F,r.rw,r.rh,x[i],y[i]);rhsY[i]=gamma*y[i]+bilinear(gy.data32F,r.rw,r.rh,x[i],y[i]);}const xn=mv(inv,rhsX,n),yn=mv(inv,rhsY,n);for(let i=0;i<n;i++){x[i]=clamp(x[i]+maxMove*Math.tanh(xn[i]-x[i]),1,r.rw-2);y[i]=clamp(y[i]+maxMove*Math.tanh(yn[i]-y[i]),1,r.rh-2);}const j=it%11;if(j<10){xsave[j].set(x);ysave[j].set(y);}else{let best=Infinity;for(let k=0;k<10;k++){let d=0;for(let i=0;i<n;i++)d=Math.max(d,Math.abs(xsave[k][i]-x[i])+Math.abs(ysave[k][i]-y[i]));best=Math.min(best,d);}if(best<conv)break;}}
  const mask=contourMaskFromPoints(cv,Array.from({length:n},(_,i)=>[x[i],y[i]]),r.rw,r.rh);preserveTopology(cv,p,r,mask);const metrics=scoreMask(cv,mask,r.initial,feature),result=regionResult(cv,p,r,mask,'active-contour-browser',metrics);mask.delete();gx.delete();gy.delete();feature.delete();rgba.delete();r.initial.delete();return result;
}

function p2Kernels(cv){return [cv.matFromArray(3,3,cv.CV_8UC1,[1,0,0,0,1,0,0,0,1]),cv.matFromArray(3,3,cv.CV_8UC1,[0,1,0,0,1,0,0,1,0]),cv.matFromArray(3,3,cv.CV_8UC1,[0,0,1,0,1,0,1,0,0]),cv.matFromArray(3,3,cv.CV_8UC1,[0,0,0,1,1,1,0,0,0])];}
function supInf(cv,u,kernels){const out=cv.Mat.zeros(u.rows,u.cols,cv.CV_8UC1),tmp=new cv.Mat();for(const k of kernels){cv.erode(u,tmp,k);cv.max(out,tmp,out);}tmp.delete();return out;}
function infSup(cv,u,kernels){const out=new cv.Mat(u.rows,u.cols,cv.CV_8UC1,new cv.Scalar(255)),tmp=new cv.Mat();for(const k of kernels){cv.dilate(u,tmp,k);cv.min(out,tmp,out);}tmp.delete();return out;}
function curvature(cv,u,kernels,phase){let a,b;if(phase%2===0){a=infSup(cv,u,kernels);b=supInf(cv,a,kernels);}else{a=supInf(cv,u,kernels);b=infSup(cv,a,kernels);}a.delete();return b;}
function inverseGaussianGradient(cv,rgba,alpha=100,sigma=2){const gray8=new cv.Mat(),gray=new cv.Mat(),blur=new cv.Mat(),gx=new cv.Mat(),gy=new cv.Mat(),mag=new cv.Mat();cv.cvtColor(rgba,gray8,cv.COLOR_RGBA2GRAY);gray8.convertTo(gray,cv.CV_32F,1/255);let k=Math.max(3,(Math.ceil(sigma*6)|1));cv.GaussianBlur(gray,blur,new cv.Size(k,k),sigma);cv.Sobel(blur,gx,cv.CV_32F,1,0,3);cv.Sobel(blur,gy,cv.CV_32F,0,1,3);cv.magnitude(gx,gy,mag);const out=new cv.Mat(mag.rows,mag.cols,cv.CV_32F);for(let i=0;i<out.data32F.length;i++)out.data32F[i]=1/Math.sqrt(1+alpha*mag.data32F[i]);gray8.delete();gray.delete();blur.delete();gx.delete();gy.delete();mag.delete();return out;}
function morphGACPass(cv,gimage,seed,{iterations=80,smoothing=1,threshold='auto',balloon=1}={}){const thr=threshold==='auto'?percentile(gimage.data32F,.40):threshold,kernels=p2Kernels(cv),structure=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3)),gx=new cv.Mat(),gy=new cv.Mat();cv.Sobel(gimage,gx,cv.CV_32F,1,0,3);cv.Sobel(gimage,gy,cv.CV_32F,0,1,3);let u=seed.clone(),phase=0;for(let it=0;it<iterations;it++){if(balloon!==0){const aux=new cv.Mat();balloon>0?cv.dilate(u,aux,structure):cv.erode(u,aux,structure);const limit=thr/Math.abs(balloon);for(let i=0;i<u.data.length;i++)if(gimage.data32F[i]>limit)u.data[i]=aux.data[i];aux.delete();}const uf=new cv.Mat(),ux=new cv.Mat(),uy=new cv.Mat();u.convertTo(uf,cv.CV_32F);cv.Sobel(uf,ux,cv.CV_32F,1,0,3);cv.Sobel(uf,uy,cv.CV_32F,0,1,3);for(let i=0;i<u.data.length;i++){const v=gx.data32F[i]*ux.data32F[i]+gy.data32F[i]*uy.data32F[i];if(v>0)u.data[i]=255;else if(v<0)u.data[i]=0;}uf.delete();ux.delete();uy.delete();for(let s=0;s<smoothing;s++){const next=curvature(cv,u,kernels,phase++);u.delete();u=next;}}kernels.forEach(k=>k.delete());structure.delete();gx.delete();gy.delete();return u;}
export function refineMorphGAC(cv,p){const r=candidateROI(cv,p,7),rgba=rgbaROI(cv,p,r),g=inverseGaussianGradient(cv,rgba,p.gacAlpha??100,p.gacSigma??2),feature=boundaryFeature(cv,rgba),dilateR=Math.max(1,Math.round(r.pxPerMM*2.5)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(dilateR*2+1,dilateR*2+1)),outer=new cv.Mat();cv.dilate(r.initial,outer,kernel);kernel.delete();const expand=morphGACPass(cv,g,r.initial,{iterations:p.iterations??70,smoothing:p.smoothing??1,threshold:p.threshold??'auto',balloon:1}),shrink=morphGACPass(cv,g,outer,{iterations:p.iterations??70,smoothing:p.smoothing??1,threshold:p.threshold??'auto',balloon:-1}),m1=scoreMask(cv,expand,r.initial,feature),m2=scoreMask(cv,shrink,r.initial,feature),mask=m2.score>m1.score?shrink:expand,discard=mask===expand?shrink:expand,metrics=mask===expand?m1:m2;discard.delete();preserveTopology(cv,p,r,mask);const result=regionResult(cv,p,r,mask,'morphgac-browser',metrics);mask.delete();outer.delete();g.delete();feature.delete();rgba.delete();r.initial.delete();return result;}

export function refineGrabCut(cv,p){const r=candidateROI(cv,p,5),rgba=rgbaROI(cv,p,r),rgb=new cv.Mat();cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);const gc=new cv.Mat(r.rh,r.rw,cv.CV_8UC1,new cv.Scalar(cv.GC_PR_BGD)),erodeR=Math.max(1,Math.round(r.pxPerMM*.8)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(erodeR*2+1,erodeR*2+1)),inner=new cv.Mat();cv.erode(r.initial,inner,kernel);kernel.delete();for(let i=0;i<gc.data.length;i++){if(r.initial.data[i])gc.data[i]=cv.GC_PR_FGD;if(inner.data[i])gc.data[i]=cv.GC_FGD;}for(let y=0;y<r.rh;y++)for(let x=0;x<r.rw;x++)if(x<3||y<3||x>=r.rw-3||y>=r.rh-3)gc.data[y*r.rw+x]=cv.GC_BGD;const bg=new cv.Mat(),fg=new cv.Mat();cv.grabCut(rgb,gc,new cv.Rect(),bg,fg,3,cv.GC_INIT_WITH_MASK);const mask=cv.Mat.zeros(r.rh,r.rw,cv.CV_8UC1);for(let i=0;i<gc.data.length;i++)if(gc.data[i]===cv.GC_FGD||gc.data[i]===cv.GC_PR_FGD)mask.data[i]=255;const feature=boundaryFeature(cv,rgba);preserveTopology(cv,p,r,mask);const metrics=scoreMask(cv,mask,r.initial,feature),result=regionResult(cv,p,r,mask,'grabcut-browser',metrics);feature.delete();mask.delete();bg.delete();fg.delete();gc.delete();inner.delete();rgb.delete();rgba.delete();r.initial.delete();return result;}

export function refineHybrid(cv,p){const baseR=candidateROI(cv,p,5),baseRGBA=rgbaROI(cv,p,baseR),feature=boundaryFeature(cv,baseRGBA),baseMetrics=scoreMask(cv,baseR.initial,baseR.initial,feature);feature.delete();baseRGBA.delete();baseR.initial.delete();const active=refineActiveContour(cv,p);if(!active)return p.candidate;const am=active.refinementMetrics||{};/* MorphGAC is deliberately the expensive fallback, not a mandatory second pass. A well-supported snake already carries stronger evidence than the starting proposal. */if(am.coverage>=.84&&am.edgeSupport>=Math.max(.28,baseMetrics.edgeSupport*.90)&&am.score>=baseMetrics.score-.04)return active;const gac=refineMorphGAC(cv,p);if(gac&&(gac.refinementMetrics?.score??0)>(am.score??0)+.025&&(gac.refinementMetrics?.coverage??0)>=.90)return gac;return active;}

export function refineCandidateWithEngine(cv,p){switch(p.engine){case'active-contour':return refineActiveContour(cv,p);case'morphgac':return refineMorphGAC(cv,p);case'grabcut':return refineGrabCut(cv,p);case'hybrid':return refineHybrid(cv,p);default:throw Error('unknown contour engine '+p.engine);}}

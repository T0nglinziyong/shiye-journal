import {activeContour,morphGAC} from './browser-active-contours.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const contourPoints=c=>Array.from({length:c.rows},(_,i)=>[c.data32S[i*2],c.data32S[i*2+1]]);

function largestExternal(cv,mask){
  const cs=new cv.MatVector(),hh=new cv.Mat();cv.findContours(mask,cs,hh,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let best=null,area=0;
  for(let i=0;i<cs.size();i++){const c=cs.get(i),a=Math.abs(cv.contourArea(c));if(a>area){best?.delete?.();best=c;area=a;}else c.delete();}
  cs.delete();hh.delete();return {contour:best,area};
}
function outerFill(cv,mask){
  const found=largestExternal(cv,mask),out=cv.Mat.zeros(mask.rows,mask.cols,cv.CV_8UC1);
  if(found.contour){const v=new cv.MatVector();v.push_back(found.contour);cv.drawContours(out,v,-1,new cv.Scalar(255),cv.FILLED);v.delete();found.contour.delete();}
  return out;
}
function maskFromCandidate(cv,c,w,h,x0,y0,rw,rh){
  const out=cv.Mat.zeros(rh,rw,cv.CV_8UC1);
  if(c.mask?.alpha?.length){
    const mw=c.mask.width,mh=c.mask.height,src=cv.matFromArray(mh,mw,cv.CV_8UC1,c.mask.alpha),resized=new cv.Mat();
    const gx=Math.round(c.x*w),gy=Math.round(c.y*h),gw=Math.max(1,Math.round(c.w*w)),gh=Math.max(1,Math.round(c.h*h));
    cv.resize(src,resized,new cv.Size(gw,gh),0,0,cv.INTER_NEAREST);
    const dx=Math.max(0,gx-x0),dy=Math.max(0,gy-y0),sw=Math.min(gw,rw-dx),sh=Math.min(gh,rh-dy);
    if(sw>0&&sh>0){const sroi=resized.roi(new cv.Rect(0,0,sw,sh)),droi=out.roi(new cv.Rect(dx,dy,sw,sh));sroi.copyTo(droi);sroi.delete();droi.delete();}
    src.delete();resized.delete();
  }else{
    const x=clamp(Math.round(c.x*w)-x0,0,rw-1),y=clamp(Math.round(c.y*h)-y0,0,rh-1),
      cw=clamp(Math.round(c.w*w),1,rw-x),ch=clamp(Math.round(c.h*h),1,rh-y);
    out.roi(new cv.Rect(x,y,cw,ch)).setTo(new cv.Scalar(255));
  }
  return outerFill(cv,out);
}
function enclosedHoles(cv,mask){
  const outer=outerFill(cv,mask),holes=new cv.Mat();cv.subtract(outer,mask,holes);outer.delete();return holes;
}
function edgeSupportMap(cv,rgba){
  const gray=new cv.Mat(),blur=new cv.Mat(),edge=new cv.Mat(),rgb=new cv.Mat(),lab=new cv.Mat(),channels=new cv.MatVector(),ab=new cv.Mat(),bb=new cv.Mat(),ae=new cv.Mat(),be=new cv.Mat(),support=new cv.Mat();
  cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(3,3),0);cv.Canny(blur,edge,8,30);
  cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);
  const a=channels.get(1),b=channels.get(2);cv.GaussianBlur(a,ab,new cv.Size(3,3),0);cv.GaussianBlur(b,bb,new cv.Size(3,3),0);cv.Canny(ab,ae,2,9);cv.Canny(bb,be,2,9);cv.bitwise_or(edge,ae,edge);cv.bitwise_or(edge,be,edge);
  const k=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5));cv.dilate(edge,support,k);
  gray.delete();blur.delete();edge.delete();rgb.delete();lab.delete();channels.delete();a.delete();b.delete();ab.delete();bb.delete();ae.delete();be.delete();k.delete();
  return support;
}
function boundarySupport(cv,mask,support){
  const found=largestExternal(cv,mask);if(!found.contour)return 0;
  const b=cv.Mat.zeros(mask.rows,mask.cols,cv.CV_8UC1),v=new cv.MatVector(),hit=new cv.Mat();v.push_back(found.contour);cv.drawContours(b,v,-1,new cv.Scalar(255),1);cv.bitwise_and(b,support,hit);
  const score=cv.countNonZero(hit)/Math.max(1,cv.countNonZero(b));found.contour.delete();b.delete();v.delete();hit.delete();return score;
}
function resizeForBudget(cv,rgba,rough,maxDim){
  const scale=Math.min(1,maxDim/Math.max(rgba.cols,rgba.rows));if(scale===1)return {image:rgba.clone(),mask:rough.clone(),scale};
  const image=new cv.Mat(),mask=new cv.Mat();cv.resize(rgba,image,new cv.Size(Math.max(1,Math.round(rgba.cols*scale)),Math.max(1,Math.round(rgba.rows*scale))),0,0,cv.INTER_AREA);cv.resize(rough,mask,new cv.Size(image.cols,image.rows),0,0,cv.INTER_NEAREST);return {image,mask,scale};
}
function grabCutMask(cv,rgba,rough){
  const gc=new cv.Mat(rough.rows,rough.cols,cv.CV_8UC1,new cv.Scalar(cv.GC_PR_BGD)),bg=new cv.Mat(),fg=new cv.Mat(),rgb=new cv.Mat();
  cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);
  for(let i=0;i<rough.data.length;i++)if(rough.data[i])gc.data[i]=cv.GC_PR_FGD;
  const ksize=Math.max(3,(Math.round(Math.min(rough.cols,rough.rows)*.06)|1)),k=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ksize,ksize)),inner=new cv.Mat();cv.erode(rough,inner,k);
  for(let i=0;i<inner.data.length;i++)if(inner.data[i])gc.data[i]=cv.GC_FGD;
  for(let x=0;x<gc.cols;x++){gc.data[x]=cv.GC_BGD;gc.data[(gc.rows-1)*gc.cols+x]=cv.GC_BGD;}
  for(let y=0;y<gc.rows;y++){gc.data[y*gc.cols]=cv.GC_BGD;gc.data[y*gc.cols+gc.cols-1]=cv.GC_BGD;}
  cv.grabCut(rgb,gc,new cv.Rect(),bg,fg,5,cv.GC_INIT_WITH_MASK);
  const out=cv.Mat.zeros(gc.rows,gc.cols,cv.CV_8UC1);for(let i=0;i<gc.data.length;i++)if(gc.data[i]===cv.GC_FGD||gc.data[i]===cv.GC_PR_FGD)out.data[i]=255;
  gc.delete();bg.delete();fg.delete();rgb.delete();k.delete();inner.delete();const filled=outerFill(cv,out);out.delete();return filled;
}
function inverseGradientGImage(cv,rgba){
  const gray=new cv.Mat(),f=new cv.Mat(),blur=new cv.Mat(),gx=new cv.Mat(),gy=new cv.Mat();cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);gray.convertTo(f,cv.CV_32F,1/255);cv.GaussianBlur(f,blur,new cv.Size(0,0),1.5,1.5,cv.BORDER_REPLICATE);cv.Sobel(blur,gx,cv.CV_32F,1,0,3,.125,0,cv.BORDER_REPLICATE);cv.Sobel(blur,gy,cv.CV_32F,0,1,3,.125,0,cv.BORDER_REPLICATE);
  const g=new Float32Array(gray.rows*gray.cols);for(let i=0;i<g.length;i++){const mag=Math.hypot(gx.data32F[i],gy.data32F[i]);g[i]=1/Math.sqrt(1+100*mag);}
  gray.delete();f.delete();blur.delete();gx.delete();gy.delete();return g;
}
function rectangleInit(mask,padFraction=.05){
  let minX=mask.cols,minY=mask.rows,maxX=-1,maxY=-1;for(let y=0;y<mask.rows;y++)for(let x=0;x<mask.cols;x++)if(mask.data[y*mask.cols+x]){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  if(maxX<minX)return new Uint8Array(mask.rows*mask.cols);
  const pad=Math.max(2,Math.round(Math.max(maxX-minX+1,maxY-minY+1)*padFraction)),x0=clamp(minX-pad,1,mask.cols-2),x1=clamp(maxX+1+pad,2,mask.cols-1),y0=clamp(minY-pad,1,mask.rows-2),y1=clamp(maxY+1+pad,2,mask.rows-1),out=new Uint8Array(mask.rows*mask.cols);
  for(let y=y0;y<y1;y++)out.fill(1,y*mask.cols+x0,y*mask.cols+x1);return out;
}
function morphMask(cv,rgba,rough,{iterations=65}={}){
  const g=inverseGradientGImage(cv,rgba),init=rectangleInit(rough),u=morphGAC(g,rgba.cols,rgba.rows,init,{numIter:iterations,smoothing:1,threshold:'auto',balloon:-1}),out=cv.Mat.zeros(rgba.rows,rgba.cols,cv.CV_8UC1);
  for(let i=0;i<u.length;i++)if(u[i])out.data[i]=255;const filled=outerFill(cv,out);out.delete();return filled;
}
function activeMask(cv,rgba,rough){
  const gray=new cv.Mat(),f=new cv.Mat(),blur=new cv.Mat();cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);gray.convertTo(f,cv.CV_32F,1/255);cv.GaussianBlur(f,blur,new cv.Size(0,0),1,1,cv.BORDER_REPLICATE);
  let minX=rough.cols,minY=rough.rows,maxX=-1,maxY=-1;for(let y=0;y<rough.rows;y++)for(let x=0;x<rough.cols;x++)if(rough.data[y*rough.cols+x]){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const pad=Math.max(2,Math.round(Math.max(maxX-minX+1,maxY-minY+1)*.05)),x0=clamp(minX-pad,1,rough.cols-2),x1=clamp(maxX+pad,2,rough.cols-1),y0=clamp(minY-pad,1,rough.rows-2),y1=clamp(maxY+pad,2,rough.rows-1),snake=[],q=32;
  // Keep the periodic snake dense. The scikit-image algorithm keeps a fixed
  // number of control points; sparse 48-point browser fixtures materially
  // changed the solution on textured paper even though smooth parity fixtures
  // passed. 128 points keeps ~5–8 px spacing in the <=320 px ROI budget and
  // tracks the official Python result on the real-photo benchmark.
  for(let i=0;i<q;i++){const t=i/q;snake.push([y0,x0+t*(x1-x0)]);}for(let i=0;i<q;i++){const t=i/q;snake.push([y0+t*(y1-y0),x1]);}for(let i=0;i<q;i++){const t=i/q;snake.push([y1,x1-t*(x1-x0)]);}for(let i=0;i<q;i++){const t=i/q;snake.push([y1-t*(y1-y0),x0]);}
  const r=activeContour(new Float32Array(blur.data32F),rgba.cols,rgba.rows,snake,{alpha:.015,beta:.12,gamma:.02,wLine:0,wEdge:1,maxNumIter:500,convergence:.05,maxPxMove:1}),pts=r.snake.flatMap(([y,x])=>[Math.round(x),Math.round(y)]),contour=cv.matFromArray(r.snake.length,1,cv.CV_32SC2,pts),out=cv.Mat.zeros(rgba.rows,rgba.cols,cv.CV_8UC1),v=new cv.MatVector();v.push_back(contour);cv.drawContours(out,v,-1,new cv.Scalar(255),cv.FILLED);gray.delete();f.delete();blur.delete();contour.delete();v.delete();return out;
}
function restoreHoles(cv,outer,holes){
  if(!holes||cv.countNonZero(holes)===0)return;const target=new cv.Mat();cv.bitwise_and(holes,outer,target);outer.setTo(new cv.Scalar(0),target);target.delete();
}
function regionFromMask(cv,mask,globalX,globalY,pageW,pageH,method,confidence,elapsed){
  const found=largestExternal(cv,mask);if(!found.contour)return null;const b=cv.boundingRect(found.contour),local=mask.roi(new cv.Rect(b.x,b.y,b.width,b.height)),packed=new cv.Mat();local.copyTo(packed);const poly=new cv.Mat();cv.approxPolyDP(found.contour,poly,Math.max(.7,cv.arcLength(found.contour,true)*.0015),true),points=contourPoints(poly).map(([x,y])=>[x-b.x,y-b.y]);found.contour.delete();poly.delete();local.delete();
  return {x:(globalX+b.x)/pageW,y:(globalY+b.y)/pageH,w:b.width/pageW,h:b.height/pageH,pixels:cv.countNonZero(mask),edgeMethod:method,boundaryConfidence:confidence,refinementMS:elapsed,mask:{width:b.width,height:b.height,alpha:new Uint8Array(packed.data),polygons:[points],topologyPreserved:true}};
}

/**
 * Browser-only boundary refinement using OpenCV.js + scikit-image-equivalent
 * contour engines. Candidate discovery remains unchanged.
 */
const HYBRID_ACTIVE_SUPPORT=.95,HYBRID_GRABCUT_SUPPORT=.90;

export function refineMaterialBoundaries(cv,p){
  const pageW=p.width,pageH=p.height,src=cv.matFromArray(pageH,pageW,cv.CV_8UC4,p.pixels),mode=p.mode||'hybrid',out=[];
  try{
    for(const candidate of p.candidates||[]){
      const started=typeof performance!=='undefined'?performance.now():Date.now(),
        gx=Math.round(candidate.x*pageW),gy=Math.round(candidate.y*pageH),
        gw=Math.max(1,Math.round(candidate.w*pageW)),gh=Math.max(1,Math.round(candidate.h*pageH)),
        pad=Math.max(5,Math.round(Math.max(gw,gh)*.12)),
        x0=Math.max(0,gx-pad),y0=Math.max(0,gy-pad),x1=Math.min(pageW,gx+gw+pad),y1=Math.min(pageH,gy+gh+pad),
        rw=x1-x0,rh=y1-y0,roi=src.roi(new cv.Rect(x0,y0,rw,rh)),
        rough=maskFromCandidate(cv,candidate,pageW,pageH,x0,y0,rw,rh),
        holes=candidate.mask?.alpha?.length?enclosedHoles(cv,rough):null;

      const finish=(selected,method,confidence,workingW,workingH)=>{
        const full=new cv.Mat();cv.resize(selected,full,new cv.Size(rw,rh),0,0,cv.INTER_NEAREST);
        selected.delete();
        if(holes){const fullHoles=new cv.Mat();cv.resize(holes,fullHoles,new cv.Size(rw,rh),0,0,cv.INTER_NEAREST);restoreHoles(cv,full,fullHoles);fullHoles.delete();}
        const elapsed=(typeof performance!=='undefined'?performance.now():Date.now())-started,
          region=regionFromMask(cv,full,x0,y0,pageW,pageH,method,confidence,elapsed);
        full.delete();
        if(region)out.push({...candidate,...region});else out.push(candidate);
      };

      if(mode==='quality'||mode==='morphgac'){
        const quality=resizeForBudget(cv,roi,rough,220),selected=morphMask(cv,quality.image,quality.mask,{iterations:65}),
          qsupport=edgeSupportMap(cv,quality.image),confidence=boundarySupport(cv,selected,qsupport);
        qsupport.delete();finish(selected,'browser-morphgac',confidence,quality.image.cols,quality.image.rows);
        quality.image.delete();quality.mask.delete();holes?.delete();rough.delete();roi.delete();continue;
      }

      const fast=resizeForBudget(cv,roi,rough,320),support=edgeSupportMap(cv,fast.image);

      if(mode==='active'){
        const selected=activeMask(cv,fast.image,fast.mask),confidence=boundarySupport(cv,selected,support);
        finish(selected,'browser-active-contour',confidence,fast.image.cols,fast.image.rows);
        support.delete();fast.image.delete();fast.mask.delete();holes?.delete();rough.delete();roi.delete();continue;
      }

      if(mode==='grabcut'||mode==='fast'){
        const selected=grabCutMask(cv,fast.image,fast.mask),confidence=boundarySupport(cv,selected,support);
        finish(selected,'browser-grabcut',confidence,fast.image.cols,fast.image.rows);
        support.delete();fast.image.delete();fast.mask.delete();holes?.delete();rough.delete();roi.delete();continue;
      }

      // Generic cascade: Active Contour is cheap, GrabCut exploits a good rough
      // mask when available, MorphGAC is reserved for difficult boundaries.
      let selected=activeMask(cv,fast.image,fast.mask),confidence=boundarySupport(cv,selected,support);
      if(confidence>=HYBRID_ACTIVE_SUPPORT){
        finish(selected,'browser-active-contour',confidence,fast.image.cols,fast.image.rows);
        support.delete();fast.image.delete();fast.mask.delete();holes?.delete();rough.delete();roi.delete();continue;
      }
      selected.delete();

      selected=grabCutMask(cv,fast.image,fast.mask);confidence=boundarySupport(cv,selected,support);
      if(confidence>=HYBRID_GRABCUT_SUPPORT){
        finish(selected,'browser-grabcut',confidence,fast.image.cols,fast.image.rows);
        support.delete();fast.image.delete();fast.mask.delete();holes?.delete();rough.delete();roi.delete();continue;
      }
      selected.delete();support.delete();fast.image.delete();fast.mask.delete();

      const quality=resizeForBudget(cv,roi,rough,180);
      selected=morphMask(cv,quality.image,quality.mask,{iterations:65});
      const qsupport=edgeSupportMap(cv,quality.image);confidence=boundarySupport(cv,selected,qsupport);
      qsupport.delete();finish(selected,'browser-morphgac',confidence,quality.image.cols,quality.image.rows);
      quality.image.delete();quality.mask.delete();holes?.delete();rough.delete();roi.delete();
    }
    return out;
  }finally{src.delete();}
}

import {morphGAC} from './browser-active-contours.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function segmentationPlanForBox(box){
  // Pale, untruncated carriers benefit from an edge-driven outside-in contour.
  // If the same pale carrier reaches the rectified frame, GrabCut is safer:
  // the true physical carrier may be clipped and therefore not form a closed
  // contour for MorphGAC to stop on.
  if(box?.boxAdjustment==='pale-carrier-margin'&&box?.touchesProtectedFrame!==true){
    return {kind:'morphgac',marginMM:1,iterations:60,smoothing:1,balloon:-1};
  }
  return {kind:'grabcut',marginMM:1,iterations:1};
}

function largestExternal(cv,mask){
  const cs=new cv.MatVector(),hh=new cv.Mat();
  cv.findContours(mask,cs,hh,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let best=null,area=0;
  for(let i=0;i<cs.size();i++){
    const c=cs.get(i),a=Math.abs(cv.contourArea(c));
    if(a>area){best?.delete?.();best=c;area=a;}else c.delete();
  }
  cs.delete();hh.delete();return best;
}

function largestConnectedPreserveHoles(cv,mask){
  const labels=new cv.Mat(),stats=new cv.Mat(),centroids=new cv.Mat(),
    count=cv.connectedComponentsWithStats(mask,labels,stats,centroids,8,cv.CV_32S);
  let best=0,area=0;
  for(let label=1;label<count;label++){
    const a=stats.data32S[label*5+4];
    if(a>area){area=a;best=label;}
  }
  const out=cv.Mat.zeros(mask.rows,mask.cols,cv.CV_8UC1);
  if(best)for(let i=0;i<out.data.length;i++)if(labels.data32S[i]===best)out.data[i]=255;
  labels.delete();stats.delete();centroids.delete();return out;
}

function inverseGradientGImage(cv,rgba){
  const gray=new cv.Mat(),f=new cv.Mat(),blur=new cv.Mat(),gx=new cv.Mat(),gy=new cv.Mat();
  cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);
  gray.convertTo(f,cv.CV_32F,1/255);
  cv.GaussianBlur(f,blur,new cv.Size(0,0),1.5,1.5,cv.BORDER_REPLICATE);
  cv.Sobel(blur,gx,cv.CV_32F,1,0,3,.125,0,cv.BORDER_REPLICATE);
  cv.Sobel(blur,gy,cv.CV_32F,0,1,3,.125,0,cv.BORDER_REPLICATE);
  const g=new Float32Array(gray.rows*gray.cols);
  for(let i=0;i<g.length;i++){
    const mag=Math.hypot(gx.data32F[i],gy.data32F[i]);
    g[i]=1/Math.sqrt(1+100*mag);
  }
  gray.delete();f.delete();blur.delete();gx.delete();gy.delete();return g;
}

function cropRegion(cv,mask,x0,y0,pageW,pageH,box,method,plan){
  const contour=largestExternal(cv,mask);
  if(!contour)return null;
  const b=cv.boundingRect(contour),local=mask.roi(new cv.Rect(b.x,b.y,b.width,b.height)),packed=new cv.Mat();
  local.copyTo(packed);
  const poly=new cv.Mat();
  cv.approxPolyDP(contour,poly,Math.max(.7,cv.arcLength(contour,true)*.0015),true);
  const points=Array.from({length:poly.rows},(_,i)=>[
    poly.data32S[i*2]-b.x,poly.data32S[i*2+1]-b.y
  ]);
  const result={
    ...box,
    x:(x0+b.x)/pageW,y:(y0+b.y)/pageH,
    w:b.width/pageW,h:b.height/pageH,
    pixels:cv.countNonZero(mask),
    edgeMethod:method,
    segmentationMethod:plan.kind,
    segmentationPlan:plan,
    sourceDetectionBox:{x:box.x,y:box.y,w:box.w,h:box.h},
    mask:{width:b.width,height:b.height,alpha:new Uint8Array(packed.data),polygons:[points],topologyPreserved:true}
  };
  packed.delete();local.delete();poly.delete();contour.delete();return result;
}

function expandedBox(box,pageW,pageH,pxPerMM,marginMM){
  const margin=pxPerMM*marginMM,
    x0=clamp(box.x*pageW-margin,0,pageW),
    y0=clamp(box.y*pageH-margin,0,pageH),
    x1=clamp((box.x+box.w)*pageW+margin,0,pageW),
    y1=clamp((box.y+box.h)*pageH+margin,0,pageH);
  return {x0,y0,x1,y1,w:x1-x0,h:y1-y0};
}

function roiGeometry(box,pageW,pageH,pxPerMM,marginMM){
  const b=expandedBox(box,pageW,pageH,pxPerMM,marginMM),
    pad=Math.max(5,Math.round(Math.max(b.w,b.h)*.12)),
    x0=Math.max(0,Math.round(b.x0)-pad),
    y0=Math.max(0,Math.round(b.y0)-pad),
    x1=Math.min(pageW,Math.round(b.x1)+pad),
    y1=Math.min(pageH,Math.round(b.y1)+pad);
  return {...b,roiX:x0,roiY:y0,roiW:x1-x0,roiH:y1-y0};
}

function segmentGrabCut(cv,page,box,plan,pxPerMM){
  const pageW=page.cols,pageH=page.rows,g=roiGeometry(box,pageW,pageH,pxPerMM,plan.marginMM),
    roi=page.roi(new cv.Rect(g.roiX,g.roiY,g.roiW,g.roiH)),
    rgb=new cv.Mat(),gc=new cv.Mat(),bg=new cv.Mat(),fg=new cv.Mat();
  try{
    cv.cvtColor(roi,rgb,cv.COLOR_RGBA2RGB);
    const rx=clamp(Math.round(g.x0)-g.roiX,1,g.roiW-2),
      ry=clamp(Math.round(g.y0)-g.roiY,1,g.roiH-2),
      rr=clamp(Math.round(g.x1)-g.roiX,rx+1,g.roiW-1),
      rb=clamp(Math.round(g.y1)-g.roiY,ry+1,g.roiH-1),
      rect=new cv.Rect(rx,ry,Math.max(1,rr-rx),Math.max(1,rb-ry));
    cv.grabCut(rgb,gc,rect,bg,fg,plan.iterations,cv.GC_INIT_WITH_RECT);
    const binary=cv.Mat.zeros(g.roiH,g.roiW,cv.CV_8UC1);
    for(let i=0;i<gc.data.length;i++){
      if(gc.data[i]===cv.GC_FGD||gc.data[i]===cv.GC_PR_FGD)binary.data[i]=255;
    }
    const main=largestConnectedPreserveHoles(cv,binary);
    binary.delete();
    const region=cropRegion(cv,main,g.roiX,g.roiY,pageW,pageH,box,'box-grabcut-rect',plan);
    main.delete();return region;
  }catch{
    return null;
  }finally{
    fg.delete();bg.delete();gc.delete();rgb.delete();roi.delete();
  }
}

function segmentMorphGAC(cv,page,box,plan,pxPerMM){
  const pageW=page.cols,pageH=page.rows,g=roiGeometry(box,pageW,pageH,pxPerMM,plan.marginMM),
    roi=page.roi(new cv.Rect(g.roiX,g.roiY,g.roiW,g.roiH)),
    rough=cv.Mat.zeros(g.roiH,g.roiW,cv.CV_8UC1);
  try{
    const rx=clamp(Math.round(g.x0)-g.roiX,0,g.roiW-1),
      ry=clamp(Math.round(g.y0)-g.roiY,0,g.roiH-1),
      rr=clamp(Math.round(g.x1)-g.roiX,rx+1,g.roiW),
      rb=clamp(Math.round(g.y1)-g.roiY,ry+1,g.roiH);
    const seedROI=rough.roi(new cv.Rect(rx,ry,Math.max(1,rr-rx),Math.max(1,rb-ry)));
    seedROI.setTo(new cv.Scalar(255));seedROI.delete();

    const scale=Math.min(1,180/Math.max(g.roiW,g.roiH)),
      qw=Math.max(1,Math.round(g.roiW*scale)),qh=Math.max(1,Math.round(g.roiH*scale)),
      image=new cv.Mat(),seed=new cv.Mat();
    cv.resize(roi,image,new cv.Size(qw,qh),0,0,cv.INTER_AREA);
    cv.resize(rough,seed,new cv.Size(qw,qh),0,0,cv.INTER_NEAREST);

    const ksize=Math.max(3,(Math.round(Math.min(qw,qh)*.025)|1)),
      kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ksize,ksize)),
      expanded=new cv.Mat();
    cv.dilate(seed,expanded,kernel);
    const init=new Uint8Array(expanded.data.length);
    for(let i=0;i<init.length;i++)init[i]=expanded.data[i]?1:0;

    const gimage=inverseGradientGImage(cv,image),
      u=morphGAC(gimage,qw,qh,init,{
        numIter:plan.iterations,smoothing:plan.smoothing,
        threshold:'auto',balloon:plan.balloon
      }),
      small=cv.Mat.zeros(qh,qw,cv.CV_8UC1);
    for(let i=0;i<u.length;i++)if(u[i])small.data[i]=255;
    const up=new cv.Mat(),binary=new cv.Mat();
    cv.resize(small,up,new cv.Size(g.roiW,g.roiH),0,0,cv.INTER_LINEAR);
    cv.threshold(up,binary,127,255,cv.THRESH_BINARY);
    const contour=largestExternal(cv,binary),filled=cv.Mat.zeros(g.roiH,g.roiW,cv.CV_8UC1);
    if(contour){
      const v=new cv.MatVector();v.push_back(contour);
      cv.drawContours(filled,v,-1,new cv.Scalar(255),cv.FILLED);
      v.delete();contour.delete();
    }
    const region=cropRegion(cv,filled,g.roiX,g.roiY,pageW,pageH,box,'box-morphgac',plan);
    filled.delete();binary.delete();up.delete();small.delete();expanded.delete();kernel.delete();seed.delete();image.delete();
    return region;
  }catch{
    return null;
  }finally{
    rough.delete();roi.delete();
  }
}

export function segmentDetectedMaterialBoxes(cv,p){
  const pageW=p.width,pageH=p.height,
    paperWidthMM=p.paperWidthMM||210,paperHeightMM=p.paperHeightMM||297,
    pxPerMM=Math.max(.5,((pageW/paperWidthMM)+(pageH/paperHeightMM))/2),
    page=cv.matFromArray(pageH,pageW,cv.CV_8UC4,p.pixels),out=[];
  try{
    for(const box of p.boxes||[]){
      const plan=segmentationPlanForBox(box);
      const region=plan.kind==='morphgac'
        ?segmentMorphGAC(cv,page,box,plan,pxPerMM)
        :segmentGrabCut(cv,page,box,plan,pxPerMM);
      out.push(region||{...box,segmentationMethod:'box-fallback'});
    }
    return out;
  }finally{
    page.delete();
  }
}

// Conservative geometric priors for physical paper-like carriers.
//
// These are model-selection priors, not material classes. Every candidate is
// compared against three hypotheses:
//   1) rotated rectangle,
//   2) ellipse,
//   3) free-form contour.
// A regular model is used only when its raster overlap with the observed
// support is high. Otherwise the contour remains free-form and is only mildly
// smoothed. The same principle is used for regular enclosed apertures.

const maskIoU=(cv,a,b,own)=>{
  const inter=own(new cv.Mat()),union=own(new cv.Mat());cv.bitwise_and(a,b,inter);cv.bitwise_or(a,b,union);
  return cv.countNonZero(inter)/Math.max(1,cv.countNonZero(union));
};
const makeContourMask=(cv,size,contour,own)=>{
  const out=own(cv.Mat.zeros(size.height,size.width,cv.CV_8UC1)),v=own(new cv.MatVector());v.push_back(contour);cv.drawContours(out,v,-1,new cv.Scalar(255),cv.FILLED);return out;
};
const ellipseContour=(cv,ellipse,own,steps=128)=>{
  const a=ellipse.angle*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),rx=ellipse.size.width/2,ry=ellipse.size.height/2,pts=[];
  for(let i=0;i<steps;i++){const t=i*Math.PI*2/steps,ux=rx*Math.cos(t),uy=ry*Math.sin(t);pts.push(Math.round(ellipse.center.x+ux*ca-uy*sa),Math.round(ellipse.center.y+ux*sa+uy*ca));}
  return own(cv.matFromArray(steps,1,cv.CV_32SC2,pts));
};

export function regularizeOuterSupport(cv,source,own,pxPerMM){
  const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(source,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let largest=null,area=0;for(let i=0;i<contours.size();i++){const c=own(contours.get(i)),a=cv.contourArea(c);if(a>area){area=a;largest=c;}}
  if(!largest||area<16)return {mask:source,model:'freeform',score:0,polygon:null};

  const observed=makeContourMask(cv,{width:source.cols,height:source.rows},largest,own);
  let best={model:'freeform',score:0,mask:observed,contour:largest};

  const rect=cv.minAreaRect(largest),box=cv.boxPoints(rect),rectContour=own(cv.matFromArray(4,1,cv.CV_32SC2,box.flatMap(p=>[Math.round(p.x),Math.round(p.y)]))),rectMask=makeContourMask(cv,{width:source.cols,height:source.rows},rectContour,own),rectIoU=maskIoU(cv,observed,rectMask,own);
  const rectArea=Math.max(1,rect.size.width*rect.size.height),rectFill=area/rectArea;
  if(rectIoU>=.90&&rectFill>=.82)best={model:'rectangle',score:rectIoU,mask:rectMask,contour:rectContour};

  if(largest.rows>=5){
    const ellipse=cv.fitEllipse(largest),ellipseArea=Math.PI*ellipse.size.width*ellipse.size.height/4;
    if(ellipseArea>16){
      const eContour=ellipseContour(cv,ellipse,own),eMask=makeContourMask(cv,{width:source.cols,height:source.rows},eContour,own),eIoU=maskIoU(cv,observed,eMask,own),eFill=area/ellipseArea;
      if(eIoU>=.88&&eFill>=.86&&eFill<=1.12&&eIoU>best.score-.015)best={model:'ellipse',score:eIoU,mask:eMask,contour:eContour};
    }
  }

  if(best.model==='freeform'){
    // Mild physical-scale smoothing removes Canny/morphology serrations but
    // keeps real concavity. No convex hull is used.
    let k=Math.max(3,Math.min(9,Math.round(pxPerMM*.45)));if(!(k&1))k++;
    const kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k))),smooth=own(new cv.Mat());
    cv.morphologyEx(observed,smooth,cv.MORPH_CLOSE,kernel);cv.morphologyEx(smooth,smooth,cv.MORPH_OPEN,kernel);
    const cs=own(new cv.MatVector()),hh=own(new cv.Mat());cv.findContours(smooth,cs,hh,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
    let lc=null,la=0;for(let i=0;i<cs.size();i++){const q=own(cs.get(i)),a=cv.contourArea(q);if(a>la){la=a;lc=q;}}
    if(lc){const eps=Math.max(.8,cv.arcLength(lc,true)*.0025),poly=own(new cv.Mat());cv.approxPolyDP(lc,poly,eps,true);best={model:'freeform',score:1,mask:makeContourMask(cv,{width:source.cols,height:source.rows},poly,own),contour:poly};}
  }

  const poly=best.contour?Array.from({length:best.contour.rows},(_,i)=>[best.contour.data32S[i*2],best.contour.data32S[i*2+1]]):null;
  return {...best,polygon:poly};
}

export function carveRegularPageApertures(cv,{mask,outer,lab,gray,pageL,pageA,pageB,pageN,evidence,pxPerMM},own){
  if(!pageN)return {count:0};
  const rows=mask.rows,cols=mask.cols,pageLike=own(cv.Mat.zeros(rows,cols,cv.CV_8UC1));
  for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){
    const i=y*cols+x;if(!outer.data[i]||evidence?.data[i])continue;
    const at=i*3,dL=lab.data[at]-pageL,chroma=Math.hypot(lab.data[at+1]-pageA,lab.data[at+2]-pageB),center=gray.data[i],texture=Math.abs(center-(gray.data[i-1]+gray.data[i+1]+gray.data[i-cols]+gray.data[i+cols])/4);
    if(chroma<4.2&&dL>=-15&&dL<=7&&texture<6.5)pageLike.data[i]=255;
  }
  let k=Math.max(3,Math.min(9,Math.round(pxPerMM*.55)));if(!(k&1))k++;
  const kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)));cv.morphologyEx(pageLike,pageLike,cv.MORPH_OPEN,kernel);cv.morphologyEx(pageLike,pageLike,cv.MORPH_CLOSE,kernel);
  const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(pageLike,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let count=0;
  for(let i=0;i<contours.size();i++){
    const c=own(contours.get(i)),a=cv.contourArea(c);if(a<Math.max(8,pxPerMM*pxPerMM*.35)||a>cv.countNonZero(outer)*.08||c.rows<5)continue;
    const ellipse=cv.fitEllipse(c),ellipseArea=Math.PI*ellipse.size.width*ellipse.size.height/4;if(ellipseArea<=0)continue;
    const eContour=ellipseContour(cv,ellipse,own,96),eMask=makeContourMask(cv,{width:cols,height:rows},eContour,own),candidate=makeContourMask(cv,{width:cols,height:rows},c,own),fit=maskIoU(cv,candidate,eMask,own);
    const axisRatio=Math.max(ellipse.size.width,ellipse.size.height)/Math.max(1,Math.min(ellipse.size.width,ellipse.size.height));
    if(fit<.80||axisRatio>2.2)continue;
    // The aperture must be enclosed by the carrier; this prevents page-like
    // areas touching the outer edge from being cut out.
    let ringK=Math.max(3,Math.min(13,Math.round(pxPerMM*.9)));if(!(ringK&1))ringK++;
    const ringKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ringK,ringK))),dil=own(new cv.Mat()),ring=own(new cv.Mat());cv.dilate(eMask,dil,ringKernel);cv.subtract(dil,eMask,ring);
    const ringOuter=own(new cv.Mat());cv.bitwise_and(ring,outer,ringOuter);
    if(cv.countNonZero(ringOuter)/Math.max(1,cv.countNonZero(ring))<.88)continue;
    mask.setTo(new cv.Scalar(0),eMask);count++;
  }
  return {count};
}

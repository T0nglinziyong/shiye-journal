// Fast traditional-CV material recognizer.
//
// Design goal: one shared full-page analysis pass, then cheap per-material ROI
// work. This avoids recomputing Lab/Canny/Hough/page context for every candidate.
//
// The recognizer is category-free:
// - one physical-scale edge enclosure pass proposes carriers;
// - page-contact + containment logic removes internal print detail;
// - regular carriers use straight-line support; irregular carriers use a local
//   outer-envelope search and mild curve smoothing;
// - round manufactured apertures are discovered once globally and accepted by
//   repeated-spacing / edge-distance consistency rather than a fixed count or side.
//
// The original full-resolution bitmap is still used later by cropBitmap().

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const bboxIoU=(a,b)=>{
  const l=Math.max(a.x,b.x),t=Math.max(a.y,b.y),r=Math.min(a.x+a.w,b.x+b.w),d=Math.min(a.y+a.h,b.y+b.h);
  const inter=Math.max(0,r-l)*Math.max(0,d-t),union=a.w*a.h+b.w*b.h-inter;return inter/Math.max(1e-9,union);
};
const containRatio=(inner,outer)=>{
  const l=Math.max(inner.x,outer.x),t=Math.max(inner.y,outer.y),r=Math.min(inner.x+inner.w,outer.x+outer.w),d=Math.min(inner.y+inner.h,outer.y+outer.h);
  return Math.max(0,r-l)*Math.max(0,d-t)/Math.max(1e-9,inner.w*inner.h);
};
const contourPoints=c=>Array.from({length:c.rows},(_,i)=>[c.data32S[i*2],c.data32S[i*2+1]]);
const shiftedContour=(cv,c,dx,dy)=>{
  const points=[];for(let i=0;i<c.rows;i++)points.push(c.data32S[i*2]+dx,c.data32S[i*2+1]+dy);
  return cv.matFromArray(c.rows,1,cv.CV_32SC2,points);
};
const boxObj=b=>({x:b.x,y:b.y,w:b.width,h:b.height});
const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[(b.length/2)|0];};
const std=a=>{if(!a.length)return 0;const m=a.reduce((s,x)=>s+x,0)/a.length;return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length);};

function pageMetrics(cv,contour,page,w,h,pxPerMM){
  const filled=cv.Mat.zeros(h,w,cv.CV_8UC1),one=new cv.MatVector(),dil=new cv.Mat(),ring=new cv.Mat(),contact=new cv.Mat(),insidePage=new cv.Mat();
  try{
    one.push_back(contour);cv.drawContours(filled,one,-1,new cv.Scalar(255),cv.FILLED);
    const k=Math.max(3,(Math.round(pxPerMM*1.9)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k));
    try{cv.dilate(filled,dil,kernel);cv.subtract(dil,filled,ring);cv.bitwise_and(ring,page,contact);cv.bitwise_and(filled,page,insidePage);}
    finally{kernel.delete();}
    return {
      paperContact:cv.countNonZero(contact)/Math.max(1,cv.countNonZero(ring)),
      insidePage:cv.countNonZero(insidePage)/Math.max(1,cv.countNonZero(filled))
    };
  }finally{filled.delete();one.delete();dil.delete();ring.delete();contact.delete();insidePage.delete();}
}

function edgeImage(cv,src){
  const gray=new cv.Mat(),blurred=new cv.Mat(),edges=new cv.Mat(),rgb=new cv.Mat(),lab=new cv.Mat(),channels=new cv.MatVector(),aBlur=new cv.Mat(),bBlur=new cv.Mat(),aEdge=new cv.Mat(),bEdge=new cv.Mat();
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blurred,new cv.Size(5,5),0);cv.Canny(blurred,edges,20,60);
  cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);
  const a=channels.get(1),b=channels.get(2);cv.GaussianBlur(a,aBlur,new cv.Size(3,3),0);cv.GaussianBlur(b,bBlur,new cv.Size(3,3),0);cv.Canny(aBlur,aEdge,4,15);cv.Canny(bBlur,bEdge,4,15);cv.bitwise_or(edges,aEdge,edges);cv.bitwise_or(edges,bEdge,edges);
  a.delete();b.delete();blurred.delete();rgb.delete();lab.delete();channels.delete();aBlur.delete();bBlur.delete();aEdge.delete();bEdge.delete();
  return {gray,edges};
}

function proposals(cv,edges,page,{width:w,height:h,paperWidthMM,paperHeightMM,smallestMM},pxPerMM){
  const closeSize=Math.max(3,(Math.round(pxPerMM*1.0)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(closeSize,closeSize)),closed=new cv.Mat(),contours=new cv.MatVector(),hierarchy=new cv.Mat(),out=[];
  try{
    cv.morphologyEx(edges,closed,cv.MORPH_CLOSE,kernel);cv.findContours(closed,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    const primaryMin=Math.max((pxPerMM*smallestMM)**2*.12,w*h*.0045),smallMin=(pxPerMM*smallestMM)**2*.12;
    for(let i=0;i<contours.size();i++){
      const c=contours.get(i),area=cv.contourArea(c);if(area<smallMin||area>w*h*.40){c.delete();continue;}
      const b=cv.boundingRect(c),widthMM=b.width/w*paperWidthMM,heightMM=b.height/h*paperHeightMM;
      if(Math.min(widthMM,heightMM)<smallestMM||b.width>w*.94||b.height>h*.94){c.delete();continue;}
      const rect=cv.minAreaRect(c),rectFill=area/Math.max(1,rect.size.width*rect.size.height),metrics=pageMetrics(cv,c,page,w,h,pxPerMM),touches=b.x<=2||b.y<=2||b.x+b.width>=w-2||b.y+b.height>=h-2;
      const frameBand=Math.max(2,Math.round(pxPerMM*1.6));let framePoints=0;
      for(let j=0;j<c.rows;j++){const x=c.data32S[j*2],y=c.data32S[j*2+1];if(x<frameBand||y<frameBand||x>=w-frameBand||y>=h-frameBand)framePoints++;}
      const frameFraction=framePoints/Math.max(1,c.rows),longThin=(b.width>w*.48&&b.height<h*.14)||(b.height>h*.48&&b.width<w*.14);
      // Rectification/page-border remnants are long, frame-hugging contours.
      // Reject them geometrically instead of relying on colour alone, while
      // still allowing a genuine compact material to touch the page edge.
      if(frameFraction>.26&&(longThin||metrics.insidePage>.42)){c.delete();continue;}
      const primary=area>=primaryMin,smallPhysical=!touches&&metrics.paperContact>.65&&metrics.insidePage<.25&&rectFill>.35;
      if(!(primary||smallPhysical)||(metrics.paperContact<.25&&rectFill<.80)){c.delete();continue;}
      const approx=new cv.Mat();cv.approxPolyDP(c,approx,Math.max(1.5,cv.arcLength(c,true)*.02),true);
      out.push({contour:c,area,bbox:boxObj(b),rectFill,paperContact:metrics.paperContact,insidePage:metrics.insidePage,vertices:approx.rows,small:!primary,frameFraction,source:'edge'});approx.delete();
    }
  }finally{kernel.delete();closed.delete();contours.delete();hierarchy.delete();}
  return out;
}

function regionProposals(cv,page,evidence,{width:w,height:h,paperWidthMM,paperHeightMM,smallestMM},pxPerMM){
  const material=cv.Mat.zeros(h,w,cv.CV_8UC1),closed=new cv.Mat(),contours=new cv.MatVector(),hierarchy=new cv.Mat(),out=[];
  try{
    // IMPORTANT: "not page-connected" is uncertainty, not foreground.
    // Shadows, illumination gradients and rectification borders can all break
    // page connectivity. Region proposals therefore require POSITIVE material
    // evidence; pale/white carriers are recovered later from physical edges.
    for(let i=0;i<w*h;i++)material.data[i]=evidence?.[i]?255:0;
    const k=Math.max(3,(Math.round(pxPerMM*.75)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k));
    try{cv.morphologyEx(material,closed,cv.MORPH_CLOSE,kernel);cv.morphologyEx(closed,closed,cv.MORPH_OPEN,kernel);}finally{kernel.delete();}
    cv.findContours(closed,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
    const minArea=Math.max((pxPerMM*smallestMM)**2*.18,w*h*.0025),frameBand=Math.max(2,Math.round(pxPerMM*1.6));
    for(let i=0;i<contours.size();i++){
      const c=contours.get(i),area=cv.contourArea(c);if(area<minArea||area>w*h*.40){c.delete();continue;}
      const b=cv.boundingRect(c),widthMM=b.width/w*paperWidthMM,heightMM=b.height/h*paperHeightMM;if(Math.min(widthMM,heightMM)<smallestMM){c.delete();continue;}
      let framePoints=0;for(let j=0;j<c.rows;j++){const x=c.data32S[j*2],y=c.data32S[j*2+1];if(x<frameBand||y<frameBand||x>=w-frameBand||y>=h-frameBand)framePoints++;}
      const frameFraction=framePoints/Math.max(1,c.rows),longThin=(b.width>w*.48&&b.height<h*.14)||(b.height>h*.48&&b.width<w*.14);
      if(frameFraction>.22&&longThin){c.delete();continue;}
      const rect=cv.minAreaRect(c),rectFill=area/Math.max(1,rect.size.width*rect.size.height),metrics=pageMetrics(cv,c,page,w,h,pxPerMM);
      if(metrics.insidePage>.18||metrics.paperContact<.35){c.delete();continue;}
      out.push({contour:c,area,bbox:boxObj(b),rectFill,paperContact:metrics.paperContact,insidePage:metrics.insidePage,vertices:0,small:false,frameFraction,source:'region'});
    }
  }finally{material.delete();closed.delete();contours.delete();hierarchy.delete();}
  return out;
}

function dedupeAndSplit(cv,candidates,w,h,pxPerMM){
  const quality=q=>(q.source==='region'?.18:0)+(q.paperContact||0)*.34+(1-(q.insidePage||0))*.24+Math.min(q.rectFill||0,1)*.18-Math.min(q.frameFraction||0,.5)*.24;
  const primary=candidates.filter(x=>!x.small).sort((a,b)=>quality(b)-quality(a)||b.area-a.area),small=candidates.filter(x=>x.small).sort((a,b)=>quality(b)-quality(a)||b.area-a.area),unique=[];
  for(const q of primary){
    const duplicate=unique.find(k=>bboxIoU(q.bbox,k.bbox)>.72&&Math.min(q.area,k.area)/Math.max(q.area,k.area)>.52);
    if(duplicate){q.contour.delete();continue;}
    unique.push(q);
  }
  const replaced=new Map();
  for(let i=0;i<unique.length;i++){
    const parent=unique[i];if(parent.rectFill>=.72)continue;
    const children=[];
    for(let j=0;j<unique.length;j++){
      if(i===j)continue;const child=unique[j],ratio=child.area/parent.area;
      if(ratio>=.10&&ratio<=.50&&containRatio(child.bbox,parent.bbox)>.90&&child.paperContact>.45)children.push(child);
    }
    if(!children.length)continue;
    const mask=cv.Mat.zeros(h,w,cv.CV_8UC1),v=new cv.MatVector();v.push_back(parent.contour);cv.drawContours(mask,v,-1,new cv.Scalar(255),cv.FILLED);v.delete();
    for(const child of children){
      const cm=cv.Mat.zeros(h,w,cv.CV_8UC1),vv=new cv.MatVector(),grown=new cv.Mat();vv.push_back(child.contour);cv.drawContours(cm,vv,-1,new cv.Scalar(255),cv.FILLED);
      const k=Math.max(3,(Math.round(pxPerMM*1.8)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k));cv.dilate(cm,grown,kernel);cv.subtract(mask,grown,mask);
      kernel.delete();grown.delete();vv.delete();cm.delete();
    }
    const k=Math.max(3,(Math.round(pxPerMM*1.4)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)),opened=new cv.Mat(),cs=new cv.MatVector(),hh=new cv.Mat();
    cv.morphologyEx(mask,opened,cv.MORPH_OPEN,kernel);cv.findContours(opened,cs,hh,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
    let best=null,bestArea=0;for(let j=0;j<cs.size();j++){const c=cs.get(j),a=cv.contourArea(c);if(a>parent.area*.25&&a>bestArea){best?.delete?.();best=c;bestArea=a;}else c.delete();}
    if(best){
      const b=cv.boundingRect(best),rect=cv.minAreaRect(best);replaced.set(i,{...parent,contour:best,area:bestArea,bbox:boxObj(b),rectFill:bestArea/Math.max(1,rect.size.width*rect.size.height)});
    }
    kernel.delete();opened.delete();cs.delete();hh.delete();mask.delete();
  }
  let accepted=[];
  for(let i=0;i<unique.length;i++){
    const q=replaced.get(i)||unique[i];
    if(accepted.some(parent=>containRatio(q.bbox,parent.bbox)>.90&&q.area/parent.area<.78&&parent.rectFill>.80)){if(q!==unique[i])q.contour.delete();continue;}
    accepted.push(q);
  }
  const final=[];
  for(const q of accepted.sort((a,b)=>quality(b)-quality(a)||b.area-a.area)){
    if(final.some(k=>bboxIoU(q.bbox,k.bbox)>.72&&Math.min(q.area,k.area)/Math.max(q.area,k.area)>.50)){if(replaced.size&&![...replaced.values()].includes(q))q.contour.delete();continue;}
    final.push(q);
  }
  // Small materials are evaluated only after primary carriers are fixed, so
  // internal print detail cannot change parent splitting/NMS.
  for(const q of small){
    if(final.some(k=>containRatio(q.bbox,k.bbox)>.75||bboxIoU(q.bbox,k.bbox)>.30)){q.contour.delete();continue;}
    final.push(q);
  }
  return final;
}

function searchOuterEnvelope(cv,src,rough,pxPerMM,w,h){
  const b=cv.boundingRect(rough),pad=Math.round(pxPerMM*6),x0=Math.max(0,b.x-pad),y0=Math.max(0,b.y-pad),x1=Math.min(w,b.x+b.width+pad),y1=Math.min(h,b.y+b.height+pad),rw=x1-x0,rh=y1-y0;
  const roi=src.roi(new cv.Rect(x0,y0,rw,rh)),gray=new cv.Mat(),rgb=new cv.Mat(),lab=new cv.Mat(),channels=new cv.MatVector(),gBlur=new cv.Mat(),aBlur=new cv.Mat(),bBlur=new cv.Mat(),edge=new cv.Mat(),ae=new cv.Mat(),be=new cv.Mat(),roughMask=cv.Mat.zeros(rh,rw,cv.CV_8UC1),support=new cv.Mat(),shifted=shiftedContour(cv,rough,-x0,-y0),one=new cv.MatVector();
  one.push_back(shifted);cv.drawContours(roughMask,one,-1,new cv.Scalar(255),cv.FILLED);const roughArea=Math.max(1,cv.countNonZero(roughMask));
  cv.cvtColor(roi,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,gBlur,new cv.Size(3,3),0);cv.Canny(gBlur,edge,8,30);
  cv.cvtColor(roi,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);const a=channels.get(1),bb=channels.get(2);cv.GaussianBlur(a,aBlur,new cv.Size(3,3),0);cv.GaussianBlur(bb,bBlur,new cv.Size(3,3),0);cv.Canny(aBlur,ae,2,9);cv.Canny(bBlur,be,2,9);cv.bitwise_or(edge,ae,edge);cv.bitwise_or(edge,be,edge);
  const supportK=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5));cv.dilate(edge,support,supportK);supportK.delete();
  const candidates=[];
  for(const mm of [.5,1.2,2.5]){
    const k=Math.max(3,(Math.round(pxPerMM*mm)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)),closed=new cv.Mat(),cs=new cv.MatVector(),hh=new cv.Mat();
    cv.morphologyEx(edge,closed,cv.MORPH_CLOSE,kernel);cv.findContours(closed,cs,hh,cv.RETR_LIST,cv.CHAIN_APPROX_NONE);
    for(let i=0;i<cs.size();i++){
      const c=cs.get(i),area=cv.contourArea(c);if(area<roughArea*.75||area>roughArea*2.5){c.delete();continue;}
      const mask=cv.Mat.zeros(rh,rw,cv.CV_8UC1),vv=new cv.MatVector(),overlap=new cv.Mat(),boundary=cv.Mat.zeros(rh,rw,cv.CV_8UC1),supported=new cv.Mat();vv.push_back(c);cv.drawContours(mask,vv,-1,new cv.Scalar(255),cv.FILLED);cv.bitwise_and(mask,roughMask,overlap);
      const coverage=cv.countNonZero(overlap)/roughArea;if(coverage<.85){mask.delete();vv.delete();overlap.delete();boundary.delete();supported.delete();c.delete();continue;}
      cv.drawContours(boundary,vv,-1,new cv.Scalar(255),1);cv.bitwise_and(boundary,support,supported);const edgeSupport=cv.countNonZero(supported)/Math.max(1,cv.countNonZero(boundary)),ratio=area/roughArea,score=coverage*.5+edgeSupport*.35+Math.min(ratio,1.8)/1.8*.15;
      const pts=contourPoints(c).map(([x,y])=>[x+x0,y+y0]);candidates.push({score,ratio,edgeSupport,mm,points:pts});
      mask.delete();vv.delete();overlap.delete();boundary.delete();supported.delete();c.delete();
    }
    kernel.delete();closed.delete();cs.delete();hh.delete();
  }
  roi.delete();gray.delete();rgb.delete();lab.delete();channels.delete();gBlur.delete();aBlur.delete();bBlur.delete();edge.delete();ae.delete();be.delete();roughMask.delete();support.delete();shifted.delete();one.delete();a.delete();bb.delete();
  candidates.sort((a,b)=>b.score-a.score);return candidates.slice(0,20);
}

function contourFromPoints(cv,points){return cv.matFromArray(points.length,1,cv.CV_32SC2,points.flatMap(([x,y])=>[Math.round(x),Math.round(y)]));}

function chooseOuter(cv,src,q,pxPerMM,w,h){
  const hull=new cv.Mat();cv.convexHull(q.contour,hull,false,true);const solidity=q.area/Math.max(1,cv.contourArea(hull));hull.delete();
  const all=searchOuterEnvelope(cv,src,q.contour,pxPerMM,w,h);if(!all.length)return {contour:q.contour,owned:false};
  let valid=all.filter(z=>z.edgeSupport>=.85&&z.ratio>=.95&&z.ratio<=2.2);if(!valid.length)valid=all;
  let chosen;
  if(solidity>.80){const bounded=valid.filter(z=>z.ratio<=1.85);chosen=(bounded.length?bounded:valid).sort((a,b)=>(b.edgeSupport*.72+Math.min(b.ratio,1.55)*.28)-(a.edgeSupport*.72+Math.min(a.ratio,1.55)*.28))[0];}
  else{
    // Irregular stickers often have a white carrier outside the dark printed
    // content. Prefer a somewhat larger, strongly-supported physical envelope
    // instead of clinging to the printed foreground itself.
    const expanded=valid.filter(z=>z.ratio>=1.05&&z.ratio<=2.05&&z.edgeSupport>=.72);
    chosen=(expanded.length?expanded:valid).sort((a,b)=>(b.edgeSupport*.68-Math.abs(b.ratio-1.38)*.18+b.ratio*.14)-(a.edgeSupport*.68-Math.abs(a.ratio-1.38)*.18+a.ratio*.14))[0];
  }
  return {contour:contourFromPoints(cv,chosen.points),owned:true};
}

function smoothFreeform(cv,contour,w,h,pxPerMM){
  // Preserve the observed concavity. Convex hulls are forbidden here because
  // they erase the white-carrier shape of irregular stickers.
  const mask=cv.Mat.zeros(h,w,cv.CV_8UC1),v=new cv.MatVector();v.push_back(contour);cv.drawContours(mask,v,-1,new cv.Scalar(255),cv.FILLED);
  const k=Math.max(3,(Math.round(pxPerMM*.48)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)),smooth=new cv.Mat(),cs=new cv.MatVector(),hh=new cv.Mat();
  cv.morphologyEx(mask,smooth,cv.MORPH_CLOSE,kernel);cv.morphologyEx(smooth,smooth,cv.MORPH_OPEN,kernel);cv.findContours(smooth,cs,hh,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let best=null,area=0;for(let i=0;i<cs.size();i++){const c=cs.get(i),a=cv.contourArea(c);if(a>area){best?.delete?.();best=c;area=a;}else c.delete();}
  const source=best||contour,pts=contourPoints(source),step=Math.max(1,Math.round(pxPerMM*.28)),sampled=[];
  for(let i=0;i<pts.length;i+=step)sampled.push(pts[i]);
  let out=sampled.length>=12?sampled:pts;
  // Circular moving-average smoothing gives a true smooth-curve prior without
  // classifying the whole object as an ellipse.
  for(let it=0;it<3&&out.length>=8;it++){
    const next=[];for(let i=0;i<out.length;i++){const a=out[(i-1+out.length)%out.length],b=out[i],d=out[(i+1)%out.length];next.push([(a[0]+2*b[0]+d[0])/4,(a[1]+2*b[1]+d[1])/4]);}out=next;
  }
  const poly=cv.matFromArray(out.length,1,cv.CV_32SC2,out.flatMap(([x,y])=>[Math.round(x),Math.round(y)]));
  mask.delete();v.delete();kernel.delete();smooth.delete();cs.delete();hh.delete();best?.delete?.();return poly;
}

function globalCircles(cv,gray,pxPerMM){
  const medianBlurred=new cv.Mat(),circles=new cv.Mat();cv.medianBlur(gray,medianBlurred,5);
  cv.HoughCircles(medianBlurred,circles,cv.HOUGH_GRADIENT,1,Math.max(8,Math.round(pxPerMM*4)),65,15,Math.max(3,Math.round(pxPerMM*.8)),Math.max(8,Math.round(pxPerMM*4)));
  const out=[];for(let i=0;i+2<circles.data32F.length;i+=3)out.push({x:Math.round(circles.data32F[i]),y:Math.round(circles.data32F[i+1]),r:Math.round(circles.data32F[i+2])});
  medianBlurred.delete();circles.delete();return out;
}

function circleCandidates(cv,mask,supportEdges,circles,w,h){
  const dist=new cv.Mat();cv.distanceTransform(mask,dist,cv.DIST_L2,5);const out=[];
  for(const circle of circles){
    const {x,y,r}=circle;if(x<0||x>=w||y<0||y>=h)continue;const edgeDistance=dist.data32F[y*w+x];if(edgeDistance<r*.72)continue;
    let supported=0,samples=32;
    for(let k=0;k<samples;k++){const t=k*Math.PI*2/samples,xx=Math.round(x+Math.cos(t)*r),yy=Math.round(y+Math.sin(t)*r);if(xx>=0&&xx<w&&yy>=0&&yy<h&&supportEdges.data[yy*w+xx])supported++;}
    const edgeSupport=supported/samples;if(edgeSupport<.16)continue;out.push({...circle,edgeDistance,edgeSupport});
  }
  dist.delete();return out;
}

function groupCircles(arr,pxPerMM){
  const groups=[];if(arr.length<3)return groups;
  for(let i=0;i<arr.length-2;i++)for(let j=i+1;j<arr.length-1;j++)for(let k=j+1;k<arr.length;k++){
    const ids=[i,j,k],pts=ids.map(id=>[arr[id].x,arr[id].y]),cx=(pts[0][0]+pts[1][0]+pts[2][0])/3,cy=(pts[0][1]+pts[1][1]+pts[2][1])/3;
    let xx=0,xy=0,yy=0;for(const [x,y] of pts){const dx=x-cx,dy=y-cy;xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;}const angle=.5*Math.atan2(2*xy,xx-yy),dir=[Math.cos(angle),Math.sin(angle)],normal=[-dir[1],dir[0]];
    if(Math.max(...pts.map(([x,y])=>Math.abs((x-cx)*normal[0]+(y-cy)*normal[1])))>pxPerMM*1.8)continue;
    const medR=median(ids.map(id=>arr[id].r)),cand=[];
    for(let q=0;q<arr.length;q++){const a=arr[q],perp=Math.abs((a.x-cx)*normal[0]+(a.y-cy)*normal[1]);if(perp<=Math.max(pxPerMM*1.8,medR*.8)&&a.r/medR>=.6&&a.r/medR<=1.6)cand.push(q);}
    if(cand.length<3)continue;
    const sorted=cand.map(id=>({t:(arr[id].x-cx)*dir[0]+(arr[id].y-cy)*dir[1],id})).sort((a,b)=>a.t-b.t),spacing=[];for(let n=1;n<sorted.length;n++)spacing.push(sorted[n].t-sorted[n-1].t);
    if(spacing.length>1&&std(spacing)/Math.max(1,spacing.reduce((s,x)=>s+x,0)/spacing.length)>.30)continue;
    const group=sorted.map(x=>x.id),edgeD=group.map(id=>arr[id].edgeDistance),radii=group.map(id=>arr[id].r),cvED=std(edgeD)/Math.max(1,edgeD.reduce((s,x)=>s+x,0)/edgeD.length),cvR=std(radii)/Math.max(1,radii.reduce((s,x)=>s+x,0)/radii.length),cvSP=spacing.length>1?std(spacing)/Math.max(1,spacing.reduce((s,x)=>s+x,0)/spacing.length):0,medRatio=median(edgeD)/Math.max(1,median(radii));
    if(cvED<=.13&&cvR<=.30&&cvSP<=.25&&medRatio<=6.2)groups.push(group);
  }
  const accepted=new Set();for(const g of groups)for(const id of g)accepted.add(id);return [...accepted].map(i=>arr[i]);
}

export function recognizeMaterialsFast(cv,p,own){
  const w=p.width,h=p.height,paperWidthMM=p.paperWidthMM||210,paperHeightMM=p.paperHeightMM||297,smallestMM=p.smallestMM||6,pxPerMM=Math.max(.5,((w/paperWidthMM)+(h/paperHeightMM))/2);
  const src=own(cv.matFromArray(h,w,cv.CV_8UC4,p.pixels)),page=own(cv.matFromArray(h,w,cv.CV_8UC1,Uint8Array.from(p.backgroundConnected||new Uint8Array(w*h),x=>x?255:0)));
  const {gray,edges}=edgeImage(cv,src);own(gray);own(edges);
  const supportEdges=own(new cv.Mat()),supportKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5)));cv.dilate(edges,supportEdges,supportKernel);
  const circlePool=globalCircles(cv,gray,pxPerMM),edgeRaw=proposals(cv,edges,page,{width:w,height:h,paperWidthMM,paperHeightMM,smallestMM},pxPerMM),regionRaw=regionProposals(cv,page,p.evidence,{width:w,height:h,paperWidthMM,paperHeightMM,smallestMM},pxPerMM),selected=dedupeAndSplit(cv,[...regionRaw,...edgeRaw],w,h,pxPerMM),out=[];
  for(const q of selected){
    const approx=new cv.Mat();cv.approxPolyDP(q.contour,approx,Math.max(1.5,cv.arcLength(q.contour,true)*.018),true);
    let boundary,ownedBoundary=false,edgeMethod;
    if(q.rectFill>.86&&approx.rows<=6){
      const rect=cv.minAreaRect(q.contour),points=cv.boxPoints(rect).flatMap(pt=>[Math.round(pt.x),Math.round(pt.y)]);boundary=cv.matFromArray(4,1,cv.CV_32SC2,points);ownedBoundary=true;edgeMethod='fast-line';
    }else{
      // A colour/region carrier already supplies object support; expanding it
      // again toward nearby edges can bridge real concavities or shadows.
      // Edge-only candidates still receive the outer-envelope search needed
      // for white-carrier stickers.
      const outer=q.source==='region'?{contour:q.contour,owned:false}:chooseOuter(cv,src,q,pxPerMM,w,h),smooth=smoothFreeform(cv,outer.contour,w,h,pxPerMM);
      if(outer.owned)outer.contour.delete();boundary=smooth;ownedBoundary=true;edgeMethod='fast-curve';
    }
    approx.delete();
    const mask=cv.Mat.zeros(h,w,cv.CV_8UC1),vv=new cv.MatVector();vv.push_back(boundary);cv.drawContours(mask,vv,-1,new cv.Scalar(255),cv.FILLED);vv.delete();
    const holes=groupCircles(circleCandidates(cv,mask,supportEdges,circlePool,w,h),pxPerMM);
    for(const hole of holes)cv.circle(mask,new cv.Point(hole.x,hole.y),hole.r,new cv.Scalar(0),cv.FILLED);
    const bounds=cv.boundingRect(boundary),x=Math.max(0,bounds.x),y=Math.max(0,bounds.y),rw=Math.min(w-x,bounds.width),rh=Math.min(h-y,bounds.height),local=mask.roi(new cv.Rect(x,y,rw,rh)),packed=new cv.Mat();local.copyTo(packed);
    const poly=contourPoints(boundary).map(([px,py])=>[px-x,py-y]),area=cv.countNonZero(mask),confidence=clamp(.45+q.paperContact*.22+Math.min(q.rectFill,.9)*.12+(edgeMethod==='fast-line'?.08:.04)+(q.source==='region'?.05:0)+Math.min(holes.length,5)*.018,0,1);
    out.push({x:x/w,y:y/h,w:rw/w,h:rh/h,pixels:area,evidenceDensity:1-q.insidePage,edgeMethod,recognitionConfidence:confidence,
      mask:{width:rw,height:rh,alpha:new Uint8Array(packed.data),polygons:[poly],topologyPreserved:true},apertureCount:holes.length});
    local.delete();packed.delete();mask.delete();if(ownedBoundary)boundary.delete();
  }
  for(const q of selected)q.contour?.delete?.();
  return out.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
}

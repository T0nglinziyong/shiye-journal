import {robustPaperLab} from './paper-reference.js';
import {expandWhiteCarrier} from './white-carrier.js';
import {recoverCarrierOutsideIn} from './outside-in-carrier.js';
import {carveInternalPaperRegions} from './internal-paper-regions.js';
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

function finalPhysicalMetrics(cv,mask,bounds,page,evidence,w,h,pxPerMM){
  const area=Math.max(1,cv.countNonZero(mask)),dil=new cv.Mat(),ring=new cv.Mat(),contact=new cv.Mat(),insidePage=new cv.Mat();
  const k=Math.max(3,(Math.round(pxPerMM*1.9)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k));
  try{
    cv.dilate(mask,dil,kernel);cv.subtract(dil,mask,ring);cv.bitwise_and(ring,page,contact);cv.bitwise_and(mask,page,insidePage);
    let evidenceN=0;
    if(evidence)for(let y=bounds.y;y<bounds.y+bounds.height;y++)for(let x=bounds.x;x<bounds.x+bounds.width;x++){
      const i=y*w+x;if(mask.data[i]&&evidence[i])evidenceN++;
    }
    return {
      paperContact:cv.countNonZero(contact)/Math.max(1,cv.countNonZero(ring)),
      insidePage:cv.countNonZero(insidePage)/area,
      insideEvidence:evidenceN/area,
      fillRatio:area/Math.max(1,bounds.width*bounds.height)
    };
  }finally{kernel.delete();dil.delete();ring.delete();contact.delete();insidePage.delete();}
}

function edgeImage(cv,src,useChroma=true){
  const gray=new cv.Mat(),blurred=new cv.Mat(),edges=new cv.Mat(),rgb=new cv.Mat(),lab=new cv.Mat(),channels=new cv.MatVector(),aBlur=new cv.Mat(),bBlur=new cv.Mat(),aEdge=new cv.Mat(),bEdge=new cv.Mat();
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blurred,new cv.Size(5,5),0);cv.Canny(blurred,edges,20,60);
  // Pale paper-on-paper boundaries can have only a modest luminance step.
  // Add a low-threshold edge channel for recall; page/frame/shadow rejection
  // happens later using carrier geometry and paper context.
  const lowEdge=new cv.Mat();cv.Canny(blurred,lowEdge,7,24);cv.bitwise_or(edges,lowEdge,edges);lowEdge.delete();
  cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);
  if(useChroma){
    cv.split(lab,channels);
    const a=channels.get(1),b=channels.get(2);cv.GaussianBlur(a,aBlur,new cv.Size(3,3),0);cv.GaussianBlur(b,bBlur,new cv.Size(3,3),0);cv.Canny(aBlur,aEdge,4,15);cv.Canny(bBlur,bEdge,4,15);cv.bitwise_or(edges,aEdge,edges);cv.bitwise_or(edges,bEdge,edges);a.delete();b.delete();
  }
  blurred.delete();rgb.delete();channels.delete();aBlur.delete();bBlur.delete();aEdge.delete();bEdge.delete();
  return {gray,edges,lab};
}

function proposals(cv,edges,page,{width:w,height:h,paperWidthMM,paperHeightMM,smallestMM},pxPerMM){
  const out=[],primaryMin=Math.max((pxPerMM*smallestMM)**2*.12,w*h*.0045),smallMin=(pxPerMM*smallestMM)**2*.12;
  // Two physical closing scales improve recall for pale/soft boundaries without
  // forcing the entire page through a large aggressive closure. Downstream NMS
  // prefers the tighter candidate when both scales explain the same carrier.
  for(const closeMM of [.55,1.10]){
    const closeSize=Math.max(3,(Math.round(pxPerMM*closeMM)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(closeSize,closeSize)),closed=new cv.Mat(),contours=new cv.MatVector(),hierarchy=new cv.Mat();
    try{
      cv.morphologyEx(edges,closed,cv.MORPH_CLOSE,kernel);cv.findContours(closed,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
      for(let i=0;i<contours.size();i++){
        const q=contours.get(i),area=cv.contourArea(q);if(area<smallMin||area>w*h*.40){q.delete();continue;}
        const b=cv.boundingRect(q),widthMM=b.width/w*paperWidthMM,heightMM=b.height/h*paperHeightMM,clearancePx=Math.max(2,Math.round(pxPerMM*3.0));
        if(Math.min(widthMM,heightMM)<smallestMM||b.width>w*.94||b.height>h*.94||b.x<clearancePx||b.y<clearancePx||b.x+b.width>w-clearancePx||b.y+b.height>h-clearancePx){q.delete();continue;}
        const rect=cv.minAreaRect(q),rectFill=area/Math.max(1,rect.size.width*rect.size.height),metrics=pageMetrics(cv,q,page,w,h,pxPerMM),touches=b.x<=2||b.y<=2||b.x+b.width>=w-2||b.y+b.height>=h-2;
        const frameBand=Math.max(2,Math.round(pxPerMM*1.6));let framePoints=0;
        for(let j=0;j<q.rows;j++){const x=q.data32S[j*2],y=q.data32S[j*2+1];if(x<frameBand||y<frameBand||x>=w-frameBand||y>=h-frameBand)framePoints++;}
        const frameFraction=framePoints/Math.max(1,q.rows),longThin=(b.width>w*.48&&b.height<h*.14)||(b.height>h*.48&&b.width<w*.14);
        if(frameFraction>.26&&(longThin||metrics.insidePage>.42)){q.delete();continue;}
        const primary=area>=primaryMin,smallPhysical=!touches&&metrics.paperContact>.58&&metrics.insidePage<.30&&rectFill>.32;
        // Soft pale carriers may have imperfect page-contact because their
        // boundary is partly missing; the larger closure is allowed only when
        // most of its interior is not page-connected and geometry is coherent.
        const paleRecovery=closeMM>.8&&!touches&&metrics.insidePage<.18&&rectFill>.45&&area>=primaryMin*.70;
        if(!(primary||smallPhysical||paleRecovery)||(metrics.paperContact<.18&&rectFill<.78&&!paleRecovery)){q.delete();continue;}
        const approx=new cv.Mat();cv.approxPolyDP(q,approx,Math.max(1.5,cv.arcLength(q,true)*.02),true);
        out.push({contour:q,area,bbox:boxObj(b),rectFill,paperContact:metrics.paperContact,insidePage:metrics.insidePage,vertices:approx.rows,small:!primary&&!paleRecovery,frameFraction,source:'edge',closureScaleMM:closeMM});approx.delete();
      }
    }finally{kernel.delete();closed.delete();contours.delete();hierarchy.delete();}
  }
  return out;
}

function fourSideEdgeSupport(cv,contour,support){
  const rect=cv.minAreaRect(contour),box=cv.boxPoints(rect),scores=[];
  for(let i=0;i<4;i++){
    const a=box[i],b=box[(i+1)%4],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),samples=Math.max(20,Math.round(len)),hits=[];
    for(let k=0;k<samples;k++){
      const t=k/Math.max(1,samples-1),x=Math.round(a.x+dx*t),y=Math.round(a.y+dy*t);
      let seen=false;
      for(let yy=Math.max(0,y-2);yy<=Math.min(support.rows-1,y+2)&&!seen;yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(support.cols-1,x+2);xx++)if(support.data[yy*support.cols+xx]){seen=true;break;}
      hits.push(seen?1:0);
    }
    scores.push(hits.reduce((s,v)=>s+v,0)/Math.max(1,hits.length));
  }
  return {min:Math.min(...scores),mean:scores.reduce((s,v)=>s+v,0)/4,sides:scores};
}

function regionProposals(cv,rgba,page,paperRef,{width:w,height:h,paperWidthMM,paperHeightMM,smallestMM},pxPerMM){
  // Positive chroma carrier proposals. We intentionally model only a/b here:
  // smooth illumination changes mostly affect L, while coloured paper remains
  // separated from the A4 sheet. Pale/white carriers are left to edge closure.
  const rgb=new cv.Mat(),lab=new cv.Mat(),channels=new cv.MatVector(),material=cv.Mat.zeros(h,w,cv.CV_8UC1),closed=new cv.Mat(),contours=new cv.MatVector(),hierarchy=new cv.Mat(),out=[];
  cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);
  const aa=channels.get(1),bb=channels.get(2),as=[],bs=[];
  for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){const i=y*w+x;if(page.data[i]){as.push(aa.data[i]);bs.push(bb.data[i]);}}
  // If page connectivity is weak, the image median is still robust because
  // journal materials occupy a minority of the rectified A4 page.
  as.sort((a,b)=>a-b);bs.sort((a,b)=>a-b);
  const connectedA=as.length?as[(as.length/2)|0]:paperRef.a,connectedB=bs.length?bs[(bs.length/2)|0]:paperRef.b;
  // Inset corner consensus is only a fallback/guard. One shadowed corner may
  // alter L, but the median a/b chroma remains a useful paper prior.
  const paperA=as.length>=w*h/80&&Math.abs(connectedA-paperRef.a)<=6?connectedA:paperRef.a;
  const paperB=bs.length>=w*h/80&&Math.abs(connectedB-paperRef.b)<=6?connectedB:paperRef.b;
  for(let i=0;i<w*h;i++)if(Math.hypot(aa.data[i]-paperA,bb.data[i]-paperB)>10)material.data[i]=255;
  const closeSize=Math.max(5,(Math.round(pxPerMM*5.5)|1)),openSize=Math.max(3,(Math.round(pxPerMM*.8)|1)),closeKernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(closeSize,closeSize)),openKernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(openSize,openSize));
  cv.morphologyEx(material,closed,cv.MORPH_CLOSE,closeKernel);cv.morphologyEx(closed,closed,cv.MORPH_OPEN,openKernel);cv.findContours(closed,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
  const minArea=Math.max((pxPerMM*smallestMM)**2*.18,w*h*.0025),frameBand=Math.max(2,Math.round(pxPerMM*1.6));
  for(let i=0;i<contours.size();i++){
    const contour=contours.get(i),area=cv.contourArea(contour);if(area<minArea||area>w*h*.40){contour.delete();continue;}
    const b=cv.boundingRect(contour),widthMM=b.width/w*paperWidthMM,heightMM=b.height/h*paperHeightMM,clearancePx=Math.max(2,Math.round(pxPerMM*3.0));if(Math.min(widthMM,heightMM)<smallestMM||b.x<clearancePx||b.y<clearancePx||b.x+b.width>w-clearancePx||b.y+b.height>h-clearancePx){contour.delete();continue;}
    const rect=cv.minAreaRect(contour),rectFill=area/Math.max(1,rect.size.width*rect.size.height);if(rectFill<.75){contour.delete();continue;}
    let framePoints=0;for(let j=0;j<contour.rows;j++){const x=contour.data32S[j*2],y=contour.data32S[j*2+1];if(x<frameBand||y<frameBand||x>=w-frameBand||y>=h-frameBand)framePoints++;}
    const frameFraction=framePoints/Math.max(1,contour.rows),longThin=(b.width>w*.48&&b.height<h*.14)||(b.height>h*.48&&b.width<w*.14);if(frameFraction>.22&&longThin){contour.delete();continue;}
    const metrics=pageMetrics(cv,contour,page,w,h,pxPerMM);
    out.push({contour,area,bbox:boxObj(b),rectFill,paperContact:metrics.paperContact,insidePage:metrics.insidePage,vertices:0,small:false,frameFraction,source:'region'});
  }
  rgb.delete();lab.delete();channels.delete();aa.delete();bb.delete();material.delete();closed.delete();contours.delete();hierarchy.delete();closeKernel.delete();openKernel.delete();
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
  let final=[];
  for(const q of accepted.sort((a,b)=>quality(b)-quality(a)||b.area-a.area)){
    if(final.some(k=>bboxIoU(q.bbox,k.bbox)>.72&&Math.min(q.area,k.area)/Math.max(q.area,k.area)>.50)){if(replaced.size&&![...replaced.values()].includes(q))q.contour.delete();continue;}
    final.push(q);
  }
  // Remove internal printed/detail contours. Conversely, if a chroma region
  // covers only a strip inside a much larger high-fill edge carrier (e.g. a
  // pale keyboard note with a coloured keyboard strip), keep the physical
  // outer carrier and discard the partial chroma region.
  final=final.filter((q,qi)=>!final.some((k,ki)=>{
    if(qi===ki)return false;
    const contained=containRatio(q.bbox,k.bbox)>.90;
    if(!contained)return false;
    if(q.source==='edge'&&k.source==='region')return q.area<k.area*.55;
    if(q.source==='region'&&k.source==='edge')return k.area>q.area*1.6&&k.rectFill>.70;
    return q.area<k.area*.55;
  }));

  // Small materials are evaluated only after primary carriers are fixed, so
  // internal print detail cannot change parent splitting/NMS.
  for(const q of small){
    if(final.some(k=>containRatio(q.bbox,k.bbox)>.75||bboxIoU(q.bbox,k.bbox)>.30)){q.contour.delete();continue;}
    final.push(q);
  }
  return final;
}

function searchOuterEnvelope(cv,src,rough,pxPerMM,w,h,useChroma=true){
  const b=cv.boundingRect(rough),pad=Math.round(pxPerMM*6),x0=Math.max(0,b.x-pad),y0=Math.max(0,b.y-pad),x1=Math.min(w,b.x+b.width+pad),y1=Math.min(h,b.y+b.height+pad),rw=x1-x0,rh=y1-y0;
  const roi=src.roi(new cv.Rect(x0,y0,rw,rh)),gray=new cv.Mat(),rgb=new cv.Mat(),lab=new cv.Mat(),channels=new cv.MatVector(),gBlur=new cv.Mat(),aBlur=new cv.Mat(),bBlur=new cv.Mat(),edge=new cv.Mat(),ae=new cv.Mat(),be=new cv.Mat(),roughMask=cv.Mat.zeros(rh,rw,cv.CV_8UC1),support=new cv.Mat(),shifted=shiftedContour(cv,rough,-x0,-y0),one=new cv.MatVector();
  one.push_back(shifted);cv.drawContours(roughMask,one,-1,new cv.Scalar(255),cv.FILLED);const roughArea=Math.max(1,cv.countNonZero(roughMask));
  cv.cvtColor(roi,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,gBlur,new cv.Size(3,3),0);cv.Canny(gBlur,edge,8,30);
  cv.cvtColor(roi,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);let a=null,bb=null;
  if(useChroma){cv.split(lab,channels);a=channels.get(1);bb=channels.get(2);cv.GaussianBlur(a,aBlur,new cv.Size(3,3),0);cv.GaussianBlur(bb,bBlur,new cv.Size(3,3),0);cv.Canny(aBlur,ae,2,9);cv.Canny(bBlur,be,2,9);cv.bitwise_or(edge,ae,edge);cv.bitwise_or(edge,be,edge);}
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
  roi.delete();gray.delete();rgb.delete();lab.delete();channels.delete();gBlur.delete();aBlur.delete();bBlur.delete();edge.delete();ae.delete();be.delete();roughMask.delete();support.delete();shifted.delete();one.delete();a?.delete?.();bb?.delete?.();
  candidates.sort((a,b)=>b.score-a.score);return candidates.slice(0,20);
}

function contourFromPoints(cv,points){return cv.matFromArray(points.length,1,cv.CV_32SC2,points.flatMap(([x,y])=>[Math.round(x),Math.round(y)]));}

function chooseOuter(cv,src,q,pxPerMM,w,h,useChroma=true){
  const hull=new cv.Mat();cv.convexHull(q.contour,hull,false,true);const solidity=q.area/Math.max(1,cv.contourArea(hull));hull.delete();
  const all=searchOuterEnvelope(cv,src,q.contour,pxPerMM,w,h,useChroma);if(!all.length)return {contour:q.contour,owned:false};
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

function smoothFreeform(cv,contour,w,h,pxPerMM,{shapeRegularization=true,curveSmooth=true}={}){
  // Global simple-shape models compete on the same observed contour. They do
  // not run serially; curve smoothing is only the fallback when no simple
  // model explains the carrier well enough.
  const hull=new cv.Mat();cv.convexHull(contour,hull,false,true);const area=Math.max(1,cv.contourArea(contour)),solidity=area/Math.max(1,cv.contourArea(hull));hull.delete();
  const sourceMask=cv.Mat.zeros(h,w,cv.CV_8UC1),sv=new cv.MatVector();sv.push_back(contour);cv.drawContours(sourceMask,sv,-1,new cv.Scalar(255),cv.FILLED);sv.delete();
  const candidates=[];
  const agreement=candidate=>{
    const inter=new cv.Mat(),union=new cv.Mat();cv.bitwise_and(sourceMask,candidate,inter);cv.bitwise_or(sourceMask,candidate,union);
    const fit=cv.countNonZero(inter)/Math.max(1,cv.countNonZero(union));inter.delete();union.delete();return fit;
  };
  if(shapeRegularization&&solidity>.93&&contour.rows>=5){
    const e=cv.fitEllipse(contour),pts=[],angle=e.angle*Math.PI/180,ca=Math.cos(angle),sa=Math.sin(angle),rx=e.size.width/2,ry=e.size.height/2;
    if(rx>=2&&ry>=2){
      for(let i=0;i<96;i++){const t=i*Math.PI*2/96,ux=rx*Math.cos(t),uy=ry*Math.sin(t);pts.push(Math.round(e.center.x+ux*ca-uy*sa),Math.round(e.center.y+ux*sa+uy*ca));}
      const ec=cv.matFromArray(96,1,cv.CV_32SC2,pts),em=cv.Mat.zeros(h,w,cv.CV_8UC1),ev=new cv.MatVector();ev.push_back(ec);cv.drawContours(em,ev,-1,new cv.Scalar(255),cv.FILLED);
      const fit=agreement(em);if(fit>.87)candidates.push({kind:'ellipse',fit,contour:ec});else ec.delete();em.delete();ev.delete();
    }
  }
  if(shapeRegularization&&solidity>.93){
    const per=cv.arcLength(contour,true);
    for(const frac of [.008,.012,.016,.022,.030]){
      const poly=new cv.Mat();cv.approxPolyDP(contour,poly,Math.max(.8,per*frac),true);const n=poly.rows;
      if(n<3||n>8||n===4||!cv.isContourConvex(poly)){poly.delete();continue;}
      const pm=cv.Mat.zeros(h,w,cv.CV_8UC1),pv=new cv.MatVector();pv.push_back(poly);cv.drawContours(pm,pv,-1,new cv.Scalar(255),cv.FILLED);
      const fit=agreement(pm);pm.delete();pv.delete();
      if(fit>.87)candidates.push({kind:'polygon-'+n,fit:fit-.003*(n-3),contour:poly});else poly.delete();
    }
  }
  sourceMask.delete();
  if(candidates.length){
    candidates.sort((a,b)=>b.fit-a.fit);const best=candidates.shift();for(const q of candidates)q.contour.delete();return best.contour;
  }
  if(!curveSmooth)return contour.clone();
  const mask=cv.Mat.zeros(h,w,cv.CV_8UC1),v=new cv.MatVector();v.push_back(contour);cv.drawContours(mask,v,-1,new cv.Scalar(255),cv.FILLED);
  const k=Math.max(3,(Math.round(pxPerMM*.40)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)),smooth=new cv.Mat(),cs=new cv.MatVector(),hh=new cv.Mat();cv.morphologyEx(mask,smooth,cv.MORPH_CLOSE,kernel);cv.morphologyEx(smooth,smooth,cv.MORPH_OPEN,kernel);cv.findContours(smooth,cs,hh,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let best=null,bestArea=0;for(let i=0;i<cs.size();i++){const q=cs.get(i),a=cv.contourArea(q);if(a>bestArea){best?.delete?.();best=q;bestArea=a;}else q.delete();}
  const source=best||contour,pts=contourPoints(source),step=Math.max(1,Math.round(pxPerMM*.22)),sampled=[];for(let i=0;i<pts.length;i+=step)sampled.push(pts[i]);let out=sampled.length>=12?sampled:pts;
  for(let it=0;it<2&&out.length>=8;it++){const next=[];for(let i=0;i<out.length;i++){const a=out[(i-1+out.length)%out.length],b=out[i],d=out[(i+1)%out.length];next.push([(a[0]+2*b[0]+d[0])/4,(a[1]+2*b[1]+d[1])/4]);}out=next;}
  const poly=cv.matFromArray(out.length,1,cv.CV_32SC2,out.flatMap(([x,y])=>[Math.round(x),Math.round(y)]));mask.delete();v.delete();kernel.delete();smooth.delete();cs.delete();hh.delete();best?.delete?.();return poly;
}

function globalCircles(cv,gray,edges,pxPerMM){
  const medianBlurred=new cv.Mat();cv.medianBlur(gray,medianBlurred,5);const out=[];
  const add=candidate=>{
    if(out.some(q=>Math.hypot(q.x-candidate.x,q.y-candidate.y)<Math.max(3,(q.r+candidate.r)*.35)&&Math.abs(q.r-candidate.r)<Math.max(3,q.r*.45)))return;
    out.push(candidate);
  };
  // Hough gives excellent recall on soft circular rims, while later structural
  // consensus bears the false-positive cost.
  for(const param2 of [14,10]){
    const circles=new cv.Mat();
    cv.HoughCircles(medianBlurred,circles,cv.HOUGH_GRADIENT,1,Math.max(7,Math.round(pxPerMM*3.2)),58,param2,Math.max(3,Math.round(pxPerMM*.70)),Math.max(12,Math.round(pxPerMM*6.0)));
    for(let i=0;i+2<circles.data32F.length;i+=3)add({x:Math.round(circles.data32F[i]),y:Math.round(circles.data32F[i+1]),r:Math.round(circles.data32F[i+2]),source:'hough'});
    circles.delete();
  }
  // Strong manufactured holes often form closed edge loops. This second,
  // cheaper proposal source avoids depending on Hough alone.
  const closed=new cv.Mat(),cs=new cv.MatVector(),hh=new cv.Mat(),k=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(3,3));cv.morphologyEx(edges,closed,cv.MORPH_CLOSE,k);
  cv.findContours(closed,cs,hh,cv.RETR_LIST,cv.CHAIN_APPROX_NONE);
  const minR=Math.max(3,pxPerMM*.65),maxR=Math.max(12,pxPerMM*6.2);
  for(let i=0;i<cs.size();i++){
    const q=cs.get(i),area=Math.abs(cv.contourArea(q)),per=cv.arcLength(q,true);if(area<Math.PI*minR*minR*.35||area>Math.PI*maxR*maxR*1.7||per<=0){q.delete();continue;}
    const b=cv.boundingRect(q),rx=b.width/2,ry=b.height/2,r=(rx+ry)/2,aspect=Math.min(rx,ry)/Math.max(rx,ry),circularity=4*Math.PI*area/(per*per);
    if(r>=minR&&r<=maxR&&aspect>=.60&&circularity>=.42)add({x:Math.round(b.x+rx),y:Math.round(b.y+ry),r:Math.round(r),source:'loop'});
    q.delete();
  }
  k.delete();closed.delete();cs.delete();hh.delete();medianBlurred.delete();return out;
}

function circleCandidates(cv,mask,supportEdges,circles,w,h,lab,paperRef,evidence,pxPerMM){
  const dist=new cv.Mat();cv.distanceTransform(mask,dist,cv.DIST_L2,5);const strict=[],weak=[];
  const colourDistance=i=>{const at=i*3,dL=(lab.data[at]-paperRef.L)/2,da=lab.data[at+1]-paperRef.a,db=lab.data[at+2]-paperRef.b;return Math.hypot(dL,da,db);};
  for(const circle of circles){
    const {x,y,r}=circle;if(x<0||x>=w||y<0||y>=h)continue;const edgeDistance=dist.data32F[y*w+x];if(edgeDistance<r*.72)continue;
    let supported=0,samples=40;
    for(let k=0;k<samples;k++){const t=k*Math.PI*2/samples,xx=Math.round(x+Math.cos(t)*r),yy=Math.round(y+Math.sin(t)*r);if(xx>=0&&xx<w&&yy>=0&&yy<h&&supportEdges.data[yy*w+xx])supported++;}
    const edgeSupport=supported/samples;if(edgeSupport<.10)continue;
    const inner=[],ring=[];let ringMaterial=0,ringN=0;
    const rr=Math.ceil(r*1.75);
    for(let yy=Math.max(0,y-rr);yy<=Math.min(h-1,y+rr);yy+=2)for(let xx=Math.max(0,x-rr);xx<=Math.min(w-1,x+rr);xx+=2){
      const d=Math.hypot(xx-x,yy-y),i=yy*w+xx;
      if(d<=r*.55)inner.push(colourDistance(i));
      else if(d>=r*1.12&&d<=r*1.65){ring.push(colourDistance(i));ringN++;if((evidence?.[i])||colourDistance(i)>7)ringMaterial++;}
    }
    if(!inner.length||!ringN)continue;const pageDistance=median(inner),ringMaterialFraction=ringMaterial/ringN,candidate={...circle,edgeDistance,edgeSupport,pageDistance,ringMaterialFraction};
    // False holes are much more expensive than misses. No isolated Hough
    // circle is ever carved: first it must pass page-colour + material-ring
    // tests, then belong to a repeated manufacturing pattern.
    if(pageDistance<=15&&edgeSupport>=.24&&ringMaterialFraction>=.18)strict.push({...candidate,pageLike:pageDistance<=12});
    else if(pageDistance<=24&&edgeSupport>=.18&&ringMaterialFraction>=.12)weak.push({...candidate,pageLike:pageDistance<=18});
  }
  dist.delete();return {strict,weak};
}

function groupCircles(strict,weak,pxPerMM,mask,supportEdges,w,h){
  const groups=[];if(strict.length<4)return [];
  for(let i=0;i<strict.length-2;i++)for(let j=i+1;j<strict.length-1;j++)for(let k=j+1;k<strict.length;k++){
    const ids=[i,j,k],pts=ids.map(id=>[strict[id].x,strict[id].y]),cx=(pts[0][0]+pts[1][0]+pts[2][0])/3,cy=(pts[0][1]+pts[1][1]+pts[2][1])/3;
    let xx=0,xy=0,yy=0;for(const [x,y] of pts){const dx=x-cx,dy=y-cy;xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;}const angle=.5*Math.atan2(2*xy,xx-yy),dir=[Math.cos(angle),Math.sin(angle)],normal=[-dir[1],dir[0]];
    if(Math.max(...pts.map(([x,y])=>Math.abs((x-cx)*normal[0]+(y-cy)*normal[1])))>pxPerMM*1.6)continue;
    const medR=median(ids.map(id=>strict[id].r)),cand=[];
    for(let q=0;q<strict.length;q++){const a=strict[q],perp=Math.abs((a.x-cx)*normal[0]+(a.y-cy)*normal[1]);if(perp<=Math.max(pxPerMM*1.6,medR*.75)&&a.r/medR>=.65&&a.r/medR<=1.5)cand.push(q);}
    if(cand.length<4)continue;
    const sorted=cand.map(id=>({t:(strict[id].x-cx)*dir[0]+(strict[id].y-cy)*dir[1],id})).sort((a,b)=>a.t-b.t),spacing=[];for(let n=1;n<sorted.length;n++)spacing.push(sorted[n].t-sorted[n-1].t);
    const meanSpacing=spacing.reduce((s,x)=>s+x,0)/Math.max(1,spacing.length);
    if(spacing.length>1&&std(spacing)/Math.max(1,meanSpacing)>.22)continue;
    const group=sorted.map(x=>x.id),edgeD=group.map(id=>strict[id].edgeDistance),radii=group.map(id=>strict[id].r),cvR=std(radii)/Math.max(1,radii.reduce((s,x)=>s+x,0)/radii.length),medRatio=median(edgeD)/Math.max(1,median(radii)),pageLike=group.filter(id=>strict[id].pageLike).length;
    // Four mutually-consistent circles are required before ANY carving. This
    // deliberately prefers a missed hole over a false hole. Distance-transform
    // depth is used only as a broad side-band guard because end holes near a
    // corner naturally have a smaller Euclidean distance to the carrier edge.
    if(cvR<=.22&&medRatio<=6.5&&pageLike>=2)groups.push({ids:group,cx,cy,dir,normal,spacing:meanSpacing,medR,edgeD:median(edgeD),minT:sorted[0].t,maxT:sorted[sorted.length-1].t});
  }
  if(!groups.length)return [];groups.sort((a,b)=>b.ids.length-a.ids.length);const accepted=new Map();
  for(const group of groups){
    for(const id of group.ids)accepted.set('s'+id,strict[id]);
    // Pattern completion is intentionally asymmetric/conservative. A weak
    // Hough circle may be promoted only when >=4 strict holes already establish
    // the manufacturing pattern, and only within one lattice step of it.
    if(group.ids.length<4)continue;
    for(let q=0;q<weak.length;q++){
      const a=weak[q],vx=a.x-group.cx,vy=a.y-group.cy,perp=Math.abs(vx*group.normal[0]+vy*group.normal[1]);if(perp>Math.max(pxPerMM*1.4,group.medR*.7))continue;
      if(a.r/group.medR<.65||a.r/group.medR>1.45||Math.abs(a.edgeDistance-group.edgeD)>Math.max(pxPerMM*1.2,group.edgeD*.25))continue;
      const t=vx*group.dir[0]+vy*group.dir[1],lattice=(t-group.minT)/Math.max(1,group.spacing),nearest=Math.round(lattice),pred=group.minT+nearest*group.spacing;
      if(Math.abs(t-pred)>group.spacing*.20||t<group.minT-group.spacing*1.05||t>group.maxT+group.spacing*1.05)continue;
      accepted.set('w'+q,a);
    }
  }
  // Recover at most one weak end member on either side, but ONLY after four
  // physical holes have established the lattice and ONLY when a real circular
  // edge exists at the predicted location. We never punch a purely predicted
  // hole; this keeps false positives much more expensive than misses.
  for(const group of groups){
    if(group.ids.length<4)continue;
    const existing=[...accepted.values()];
    for(const t of [group.minT-group.spacing,group.maxT+group.spacing]){
      const x=Math.round(group.cx+group.dir[0]*t),y=Math.round(group.cy+group.dir[1]*t),r=Math.round(group.medR);
      if(x<r+1||y<r+1||x>=w-r-1||y>=h-r-1||!mask.data[y*w+x])continue;
      if(existing.some(q=>Math.hypot(q.x-x,q.y-y)<group.spacing*.35))continue;
      let edge=0,inside=0,samples=56;
      for(let k=0;k<samples;k++){
        const angle=k*Math.PI*2/samples,xx=Math.round(x+Math.cos(angle)*r),yy=Math.round(y+Math.sin(angle)*r);
        if(xx>=0&&xx<w&&yy>=0&&yy<h){if(supportEdges.data[yy*w+xx])edge++;if(mask.data[yy*w+xx])inside++;}
      }
      const edgeSupport=edge/samples,insideFraction=inside/samples;
      if(edgeSupport>=.55&&insideFraction>=.82)accepted.set('p'+x+','+y,{x,y,r,edgeSupport,edgeDistance:r,pageDistance:0,ringMaterialFraction:1,inferred:true});
    }
  }
  return [...accepted.values()];
}

export function recognizeMaterialsFast(cv,p,own){
  if(p.rectified!==true)throw Error('materials-fast requires rectified A4 input');
  const w=p.width,h=p.height,paperWidthMM=p.paperWidthMM||210,paperHeightMM=p.paperHeightMM||297,smallestMM=p.smallestMM||6,pxPerMM=Math.max(.5,((w/paperWidthMM)+(h/paperHeightMM))/2),
    post={shapeRegularization:p.postprocess?.shapeRegularization===true,curveSmooth:p.postprocess?.curveSmooth!==false,apertures:p.postprocess?.apertures!==false},
    useChroma=p.chromaEdges!==false;
  const src=own(cv.matFromArray(h,w,cv.CV_8UC4,p.pixels)),page=own(cv.matFromArray(h,w,cv.CV_8UC1,Uint8Array.from(p.backgroundConnected||new Uint8Array(w*h),x=>x?255:0)));
  const {gray,edges,lab}=edgeImage(cv,src,useChroma);own(gray);own(edges);own(lab);
  const paperRef=robustPaperLab(lab,page,w,h),supportEdges=own(new cv.Mat()),supportKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5)));cv.dilate(edges,supportEdges,supportKernel);
  const edgeRaw=proposals(cv,edges,page,{width:w,height:h,paperWidthMM,paperHeightMM,smallestMM},pxPerMM),regionRaw=regionProposals(cv,src,page,paperRef,{width:w,height:h,paperWidthMM,paperHeightMM,smallestMM},pxPerMM),selected=dedupeAndSplit(cv,[...regionRaw,...edgeRaw],w,h,pxPerMM),out=[];
  for(const q of selected){
    const approx=new cv.Mat();cv.approxPolyDP(q.contour,approx,Math.max(1.5,cv.arcLength(q.contour,true)*.018),true);
    let boundary,ownedBoundary=false,edgeMethod,carrierDiagnostics=null;
    if(post.shapeRegularization&&q.source==='region'&&q.rectFill>.90&&approx.rows===4&&fourSideEdgeSupport(cv,q.contour,supportEdges).min>=.68){
      // Colour-supported carriers already identify the whole piece, so a
      // four-sided high-fill region can safely use straight physical edges.
      const rect=cv.minAreaRect(q.contour),points=cv.boxPoints(rect).flatMap(pt=>[Math.round(pt.x),Math.round(pt.y)]);boundary=cv.matFromArray(4,1,cv.CV_32SC2,points);ownedBoundary=true;edgeMethod='fast-line';
    }else if(q.source==='edge'){
      // A printed seed inside a white sticker is surrounded by carrier, not by
      // A4 paper, so its paper-contact is low. Only that class of edge
      // candidate pays for the expensive carrier-expansion pass. A complete
      // physical oval/card already touches paper and skips directly to geometry.
      const seedOnly=q.paperContact<.26&&q.rectFill>.78,shouldExpandWhite=q.paperContact<.52&&q.rectFill<.90;
      const outsideIn=shouldExpandWhite?recoverCarrierOutsideIn(cv,{contour:q.contour,edges,w,h,pxPerMM}):{recovered:false};
      if(outsideIn.recovered){
        carrierDiagnostics={edgeSupport:outsideIn.edgeSupport,areaRatio:outsideIn.areaRatio,seedCoverage:outsideIn.seedCoverage,source:'outside-in'};
        boundary=smoothFreeform(cv,outsideIn.contour,w,h,pxPerMM,post);outsideIn.contour.delete();ownedBoundary=true;edgeMethod='fast-outside-in-carrier';
      }else{
        const carrier=shouldExpandWhite?expandWhiteCarrier(cv,{contour:q.contour,page,edges,lab,w,h,pxPerMM,paperRef}):{expanded:false};
        if(carrier.expanded){
          carrierDiagnostics={edgeSupport:carrier.edgeSupport,areaRatio:carrier.areaRatio,seedCoverage:carrier.seedCoverage,source:'white-carrier'};
          boundary=smoothFreeform(cv,carrier.contour,w,h,pxPerMM,post);carrier.contour.delete();ownedBoundary=true;edgeMethod='fast-white-carrier';
        }else if(seedOnly){
          // A low-contact contour is normally internal print/detail. Before
          // rejecting it, allow one edge-derived outer-envelope recovery: it
          // must grow materially beyond the seed AND the recovered perimeter
          // must actually face page background. This retains weak white
          // die-cut outlines without promoting a closed printed box.
          const outer=chooseOuter(cv,src,q,pxPerMM,w,h,useChroma),outerArea=Math.abs(cv.contourArea(outer.contour)),outerMetrics=pageMetrics(cv,outer.contour,page,w,h,pxPerMM),
            outerRatio=outerArea/Math.max(1,q.area),validOuter=outer.owned&&outerRatio>=1.08&&outerMetrics.paperContact>=.30&&outerMetrics.insidePage<=.22;
          if(validOuter){
            boundary=smoothFreeform(cv,outer.contour,w,h,pxPerMM,post);outer.contour.delete();ownedBoundary=true;edgeMethod='fast-curve';
          }else{
            if(outer.owned)outer.contour.delete();approx.delete();continue;
          }
        }else if(post.shapeRegularization&&q.rectFill>.92&&approx.rows===4&&q.paperContact>.58&&q.insidePage<.22&&fourSideEdgeSupport(cv,q.contour,supportEdges).min>=.68){
        const rect=cv.minAreaRect(q.contour),points=cv.boxPoints(rect).flatMap(pt=>[Math.round(pt.x),Math.round(pt.y)]);boundary=cv.matFromArray(4,1,cv.CV_32SC2,points);ownedBoundary=true;edgeMethod='fast-line';
      }else{
        const outer=chooseOuter(cv,src,q,pxPerMM,w,h,useChroma),smooth=smoothFreeform(cv,outer.contour,w,h,pxPerMM,post);if(outer.owned)outer.contour.delete();boundary=smooth;ownedBoundary=true;edgeMethod='fast-curve';
        }
      }
    }else{
      boundary=smoothFreeform(cv,q.contour,w,h,pxPerMM,post);ownedBoundary=true;edgeMethod='fast-curve';
    }
    approx.delete();
    const mask=cv.Mat.zeros(h,w,cv.CV_8UC1),vv=new cv.MatVector();vv.push_back(boundary);cv.drawContours(mask,vv,-1,new cv.Scalar(255),cv.FILLED);vv.delete();
    const openings=post.apertures?carveInternalPaperRegions(cv,{mask,lab,gray,page,evidence:p.evidence,w,h,pxPerMM,paperRef}):{count:0,regions:[],diagnostics:[],paperRef};
    const bounds=cv.boundingRect(boundary),x=Math.max(0,bounds.x),y=Math.max(0,bounds.y),rw=Math.min(w-x,bounds.width),rh=Math.min(h-y,bounds.height),physical=finalPhysicalMetrics(cv,mask,bounds,page,p.evidence,w,h,pxPerMM),local=mask.roi(new cv.Rect(x,y,rw,rh)),packed=new cv.Mat();local.copyTo(packed);
    const poly=contourPoints(boundary).map(([px,py])=>[px-x,py-y]),area=cv.countNonZero(mask),recovered=!!carrierDiagnostics,
      confidence=clamp(.40+physical.paperContact*.24+Math.min(q.rectFill,.9)*.10+(edgeMethod==='fast-line'?.08:.04)+(q.source==='region'?.06:0)+(recovered?.08:0)+Math.min(openings.count,5)*.012-Math.min(physical.insidePage,.5)*.28,0,1);
    out.push({x:x/w,y:y/h,w:rw/w,h:rh/h,pixels:area,evidenceDensity:1-physical.insidePage,edgeMethod,recognitionConfidence:confidence,
      proposalSource:q.source,paperContactRatio:physical.paperContact,interiorBackgroundRatio:physical.insidePage,insideEvidenceRatio:physical.insideEvidence,fillRatio:physical.fillRatio,rectFill:q.rectFill,
      physicalCarrierRecovered:recovered,carrierRecoverySource:carrierDiagnostics?.source||null,carrierEdgeSupport:carrierDiagnostics?.edgeSupport??0,carrierSeedCoverage:carrierDiagnostics?.seedCoverage??0,carrierAreaRatio:carrierDiagnostics?.areaRatio??1,
      mask:{width:rw,height:rh,alpha:new Uint8Array(packed.data),polygons:[poly],topologyPreserved:true,apertureRegions:openings.regions},apertureCount:openings.count,apertureDiagnostics:openings.diagnostics,aperturePaperRef:openings.paperRef});
    local.delete();packed.delete();mask.delete();if(ownedBoundary)boundary.delete();
  }
  for(const q of selected)q.contour?.delete?.();
  return out.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
}

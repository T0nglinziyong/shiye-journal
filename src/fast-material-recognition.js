// Region-first traditional CV material recognition.
//
// The corrected A4 page is a known scene: most pixels are paper background and
// materials form closed physical regions on top of it.  Candidate identity is
// therefore discovered from page connectivity first; edges are used afterwards
// to refine the physical carrier.  This avoids the old failure mode where every
// strong Canny contour (page edge, shadow, printed box) could become a material.
//
// Pipeline:
//   page chroma + gradient flood -> physical regions -> optional watershed split
//   -> line / smooth-curve / freeform boundary prior -> repeated aperture pattern
//
// It contains no case IDs, material classes, fixed hole count, or fixed hole side.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[(b.length/2)|0];};
const std=a=>{if(!a.length)return 0;const m=a.reduce((s,x)=>s+x,0)/a.length;return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length);};
const contourPoints=c=>Array.from({length:c.rows},(_,i)=>[c.data32S[i*2],c.data32S[i*2+1]]);
const contourFromPoints=(cv,points)=>cv.matFromArray(points.length,1,cv.CV_32SC2,points.flatMap(([x,y])=>[Math.round(x),Math.round(y)]));
const filledContour=(cv,w,h,contour)=>{
  const out=cv.Mat.zeros(h,w,cv.CV_8UC1),v=new cv.MatVector();v.push_back(contour);cv.drawContours(out,v,-1,new cv.Scalar(255),cv.FILLED);v.delete();return out;
};
const maskIoU=(cv,a,b)=>{
  const inter=new cv.Mat(),union=new cv.Mat();cv.bitwise_and(a,b,inter);cv.bitwise_or(a,b,union);
  const score=cv.countNonZero(inter)/Math.max(1,cv.countNonZero(union));inter.delete();union.delete();return score;
};
const largestExternal=(cv,mask)=>{
  const cs=new cv.MatVector(),hh=new cv.Mat();cv.findContours(mask,cs,hh,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let best=null,area=0;
  for(let i=0;i<cs.size();i++){const c=cs.get(i),a=cv.contourArea(c);if(a>area){best?.delete?.();best=c;area=a;}else c.delete();}
  cs.delete();hh.delete();return {contour:best,area};
};

function edgeImage(cv,src){
  const gray=new cv.Mat(),blurred=new cv.Mat(),edges=new cv.Mat(),rgb=new cv.Mat(),lab=new cv.Mat(),channels=new cv.MatVector(),aBlur=new cv.Mat(),bBlur=new cv.Mat(),aEdge=new cv.Mat(),bEdge=new cv.Mat();
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blurred,new cv.Size(5,5),0);cv.Canny(blurred,edges,20,60);
  cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);
  const a=channels.get(1),b=channels.get(2);cv.GaussianBlur(a,aBlur,new cv.Size(3,3),0);cv.GaussianBlur(b,bBlur,new cv.Size(3,3),0);cv.Canny(aBlur,aEdge,4,15);cv.Canny(bBlur,bEdge,4,15);cv.bitwise_or(edges,aEdge,edges);cv.bitwise_or(edges,bEdge,edges);
  a.delete();b.delete();blurred.delete();rgb.delete();lab.delete();channels.delete();aBlur.delete();bBlur.delete();aEdge.delete();bEdge.delete();
  return {gray,edges};
}

function pageBackground(cv,src,w,h){
  const rgb=new cv.Mat(),lab=new cv.Mat(),gray=new cv.Mat(),blurred=new cv.Mat(),gx=new cv.Mat(),gy=new cv.Mat(),grad=new cv.Mat();
  cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blurred,new cv.Size(5,5),0);
  cv.Sobel(blurred,gx,cv.CV_32F,1,0,3);cv.Sobel(blurred,gy,cv.CV_32F,0,1,3);cv.magnitude(gx,gy,grad);
  const band=Math.max(5,Math.round(Math.min(w,h)*.04)),as=[],bs=[];
  for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){
    if(x>=band&&x<w-band&&y>=band&&y<h-band)continue;
    const at=(y*w+x)*3;as.push(lab.data[at+1]);bs.push(lab.data[at+2]);
  }
  const medA=median(as)||128,medB=median(bs)||128,pass=cv.Mat.zeros(h,w,cv.CV_8UC1);
  for(let i=0;i<w*h;i++){
    const at=i*3,da=lab.data[at+1]-medA,db=lab.data[at+2]-medB,chroma=Math.hypot(da,db);
    if(chroma<10&&grad.data32F[i]<25)pass.data[i]=255;
  }
  const labels=new cv.Mat(),stats=new cv.Mat(),centroids=new cv.Mat(),count=cv.connectedComponentsWithStats(pass,labels,stats,centroids,8,cv.CV_32S),touch=new Uint8Array(count);
  const mark=i=>{const label=labels.data32S[i];if(label>0)touch[label]=1;};
  for(let x=0;x<w;x++){mark(x);mark((h-1)*w+x);}
  for(let y=1;y<h-1;y++){mark(y*w);mark(y*w+w-1);}
  const background=cv.Mat.zeros(h,w,cv.CV_8UC1);
  for(let i=0;i<w*h;i++){const label=labels.data32S[i];if(label>0&&touch[label])background.data[i]=255;}
  rgb.delete();lab.delete();gray.delete();blurred.delete();gx.delete();gy.delete();grad.delete();pass.delete();labels.delete();stats.delete();centroids.delete();
  return background;
}

function componentMask(cv,labels,label,w,h,b){
  const mask=cv.Mat.zeros(h,w,cv.CV_8UC1);
  for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){const i=y*w+x;if(labels.data32S[i]===label)mask.data[i]=255;}
  return mask;
}

function splitMergedRegion(cv,src,mask,pxPerMM,parentArea){
  const dist=new cv.Mat(),sure=new cv.Mat(),kernelSize=Math.max(3,(Math.round(pxPerMM*.8)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(kernelSize,kernelSize));
  cv.distanceTransform(mask,dist,cv.DIST_L2,5);const max=cv.minMaxLoc(dist).maxVal;
  if(max<=0){dist.delete();sure.delete();kernel.delete();return [];}
  cv.threshold(dist,sure,max*.32,255,cv.THRESH_BINARY);sure.convertTo(sure,cv.CV_8UC1);cv.morphologyEx(sure,sure,cv.MORPH_OPEN,kernel);kernel.delete();
  const peaks=new cv.Mat(),peakStats=new cv.Mat(),peakCentroids=new cv.Mat(),peakCount=cv.connectedComponentsWithStats(sure,peaks,peakStats,peakCentroids,8,cv.CV_32S);
  if(peakCount<=2){dist.delete();sure.delete();peaks.delete();peakStats.delete();peakCentroids.delete();return [];}
  const markers=cv.Mat.zeros(mask.rows,mask.cols,cv.CV_32SC1);
  for(let i=0;i<mask.rows*mask.cols;i++){
    if(!mask.data[i])markers.data32S[i]=1;
    else{const label=peaks.data32S[i];markers.data32S[i]=label>0?label+1:0;}
  }
  const rgb=new cv.Mat();cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.watershed(rgb,markers);rgb.delete();
  const parts=[];
  for(let label=2;label<=peakCount;label++){
    const part=cv.Mat.zeros(mask.rows,mask.cols,cv.CV_8UC1);let area=0;
    for(let i=0;i<mask.rows*mask.cols;i++)if(mask.data[i]&&markers.data32S[i]===label){part.data[i]=255;area++;}
    if(area>=parentArea*.15)parts.push({mask:part,area});else part.delete();
  }
  dist.delete();sure.delete();peaks.delete();peakStats.delete();peakCentroids.delete();markers.delete();
  const kept=parts.sort((a,b)=>b.area-a.area);const sum=kept.reduce((s,x)=>s+x.area,0);
  if(kept.length<2||sum<parentArea*.58){for(const x of kept)x.mask.delete();return [];}
  return kept;
}

function discoverRegions(cv,src,w,h,pxPerMM,smallestMM){
  const background=pageBackground(cv,src,w,h),foreground=new cv.Mat();cv.bitwise_not(background,foreground);
  const labels=new cv.Mat(),stats=new cv.Mat(),centroids=new cv.Mat(),count=cv.connectedComponentsWithStats(foreground,labels,stats,centroids,8,cv.CV_32S);
  const minArea=Math.max(500,(pxPerMM*smallestMM)**2*.20,w*h*.0015),regions=[];
  for(let label=1;label<count;label++){
    const at=label*5,x=stats.data32S[at],y=stats.data32S[at+1],bw=stats.data32S[at+2],bh=stats.data32S[at+3],area=stats.data32S[at+4];
    if(area<minArea||bw<2||bh<2)continue;
    const fill=area/Math.max(1,bw*bh),touch=x<=1||y<=1||x+bw>=w-1||y+bh>=h-1,longFrame=bw>w*.50||bh>h*.50;
    if(touch&&longFrame&&fill<.20)continue;
    const mask=componentMask(cv,labels,label,w,h,{x,y,width:bw,height:bh}),outer=largestExternal(cv,mask);
    if(!outer.contour){mask.delete();continue;}
    const hull=new cv.Mat();cv.convexHull(outer.contour,hull,false,true);const hullArea=Math.max(1,cv.contourArea(hull)),solidity=outer.area/hullArea;hull.delete();
    const bboxFraction=bw*bh/(w*h);
    if(solidity<.80&&bboxFraction>.12){
      const parts=splitMergedRegion(cv,src,mask,pxPerMM,area);
      if(parts.length){
        outer.contour.delete();mask.delete();
        for(const part of parts){
          const ext=largestExternal(cv,part.mask);if(ext.contour)regions.push({mask:part.mask,contour:ext.contour,area:part.area});else part.mask.delete();
        }
        continue;
      }
    }
    regions.push({mask,contour:outer.contour,area});
  }
  background.delete();foreground.delete();labels.delete();stats.delete();centroids.delete();
  return regions;
}

function cleanForLine(cv,mask,pxPerMM){
  const k=Math.max(3,(Math.round(pxPerMM*3)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)),opened=new cv.Mat();
  cv.morphologyEx(mask,opened,cv.MORPH_OPEN,kernel);kernel.delete();
  const labels=new cv.Mat(),stats=new cv.Mat(),centroids=new cv.Mat(),count=cv.connectedComponentsWithStats(opened,labels,stats,centroids,8,cv.CV_32S);
  let best=0,bestArea=0;for(let label=1;label<count;label++){const a=stats.data32S[label*5+4];if(a>bestArea){bestArea=a;best=label;}}
  if(best){
    opened.setTo(new cv.Scalar(0));
    for(let i=0;i<labels.data32S.length;i++)if(labels.data32S[i]===best)opened.data[i]=255;
  }
  labels.delete();stats.delete();centroids.delete();return opened;
}

function modelConsistency(cv,mask){
  const ext=largestExternal(cv,mask);if(!ext.contour)return null;
  const filled=filledContour(cv,mask.cols,mask.rows,ext.contour),rect=cv.minAreaRect(ext.contour),box=cv.boxPoints(rect),rectContour=cv.matFromArray(4,1,cv.CV_32SC2,box.flatMap(p=>[Math.round(p.x),Math.round(p.y)])),rectMask=filledContour(cv,mask.cols,mask.rows,rectContour),rectScore=maskIoU(cv,filled,rectMask);
  let ellipseScore=0,ellipse=null,ellipseMask=null;
  if(ext.contour.rows>=5){
    ellipse=cv.fitEllipse(ext.contour);
    const eContour=ellipseContour(cv,ellipse,128);
    ellipseMask=filledContour(cv,mask.cols,mask.rows,eContour);
    eContour.delete();
    ellipseScore=maskIoU(cv,filled,ellipseMask);
  }
  filled.delete();rectMask.delete();
  return {contour:ext.contour,rectContour,rectScore,ellipse,ellipseMask,ellipseScore};
}

function searchOuterEnvelope(cv,src,rough,pxPerMM,w,h){
  const b=cv.boundingRect(rough),pad=Math.round(pxPerMM*6),x0=Math.max(0,b.x-pad),y0=Math.max(0,b.y-pad),x1=Math.min(w,b.x+b.width+pad),y1=Math.min(h,b.y+b.height+pad),rw=x1-x0,rh=y1-y0;
  const roi=src.roi(new cv.Rect(x0,y0,rw,rh)),gray=new cv.Mat(),rgb=new cv.Mat(),lab=new cv.Mat(),channels=new cv.MatVector(),gBlur=new cv.Mat(),aBlur=new cv.Mat(),bBlur=new cv.Mat(),edge=new cv.Mat(),ae=new cv.Mat(),be=new cv.Mat(),roughMask=cv.Mat.zeros(rh,rw,cv.CV_8UC1),support=new cv.Mat(),shifted=contourFromPoints(cv,contourPoints(rough).map(([x,y])=>[x-x0,y-y0])),one=new cv.MatVector();
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
      const cm=cv.Mat.zeros(rh,rw,cv.CV_8UC1),vv=new cv.MatVector(),overlap=new cv.Mat(),boundary=cv.Mat.zeros(rh,rw,cv.CV_8UC1),supported=new cv.Mat();vv.push_back(c);cv.drawContours(cm,vv,-1,new cv.Scalar(255),cv.FILLED);cv.bitwise_and(cm,roughMask,overlap);
      const coverage=cv.countNonZero(overlap)/roughArea;if(coverage<.85){cm.delete();vv.delete();overlap.delete();boundary.delete();supported.delete();c.delete();continue;}
      cv.drawContours(boundary,vv,-1,new cv.Scalar(255),1);cv.bitwise_and(boundary,support,supported);const edgeSupport=cv.countNonZero(supported)/Math.max(1,cv.countNonZero(boundary)),ratio=area/roughArea;
      candidates.push({ratio,coverage,edgeSupport,points:contourPoints(c).map(([x,y])=>[x+x0,y+y0])});
      cm.delete();vv.delete();overlap.delete();boundary.delete();supported.delete();c.delete();
    }
    kernel.delete();closed.delete();cs.delete();hh.delete();
  }
  roi.delete();gray.delete();rgb.delete();lab.delete();channels.delete();gBlur.delete();aBlur.delete();bBlur.delete();edge.delete();ae.delete();be.delete();roughMask.delete();support.delete();shifted.delete();one.delete();a.delete();bb.delete();
  return candidates;
}

function ellipseContour(cv,ellipse,steps=128){
  const angle=ellipse.angle*Math.PI/180,ca=Math.cos(angle),sa=Math.sin(angle),rx=ellipse.size.width/2,ry=ellipse.size.height/2,pts=[];
  for(let i=0;i<steps;i++){const t=i*Math.PI*2/steps,ux=rx*Math.cos(t),uy=ry*Math.sin(t);pts.push([ellipse.center.x+ux*ca-uy*sa,ellipse.center.y+ux*sa+uy*ca]);}
  return contourFromPoints(cv,pts);
}

function smoothFreeform(cv,contour,w,h,pxPerMM){
  const mask=filledContour(cv,w,h,contour),k=Math.max(3,(Math.round(pxPerMM*.48)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)),smooth=new cv.Mat();
  cv.morphologyEx(mask,smooth,cv.MORPH_CLOSE,kernel);cv.morphologyEx(smooth,smooth,cv.MORPH_OPEN,kernel);kernel.delete();mask.delete();
  const ext=largestExternal(cv,smooth);smooth.delete();if(!ext.contour)return contour.clone();
  const poly=new cv.Mat();cv.approxPolyDP(ext.contour,poly,Math.max(.7,cv.arcLength(ext.contour,true)*.0012),true);ext.contour.delete();return poly;
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
    const {x,y,r}=circle;if(x<0||x>=w||y<0||y>=h||!mask.data[y*w+x])continue;const edgeDistance=dist.data32F[y*w+x];if(edgeDistance<r*.72)continue;
    let supported=0,samples=32;for(let k=0;k<samples;k++){const t=k*Math.PI*2/samples,xx=Math.round(x+Math.cos(t)*r),yy=Math.round(y+Math.sin(t)*r);if(xx>=0&&xx<w&&yy>=0&&yy<h&&supportEdges.data[yy*w+xx])supported++;}
    const edgeSupport=supported/samples;if(edgeSupport<.16)continue;out.push({...circle,edgeDistance,edgeSupport});
  }
  dist.delete();return out;
}

function groupCircles(arr,pxPerMM){
  const groups=[];if(arr.length<3)return [];
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
  const src=own(cv.matFromArray(h,w,cv.CV_8UC4,p.pixels)),regions=discoverRegions(cv,src,w,h,pxPerMM,smallestMM),edge=edgeImage(cv,src),gray=own(edge.gray),edges=own(edge.edges),supportEdges=own(new cv.Mat()),supportKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5)));
  cv.dilate(edges,supportEdges,supportKernel);const circlePool=globalCircles(cv,gray,pxPerMM),out=[];
  for(const region of regions){
    const base=modelConsistency(cv,region.mask);if(!base){region.mask.delete();region.contour.delete();continue;}
    let boundary=null,edgeMethod='fast-freeform',confidence=.65;
    // Smooth closed curve: the low-complexity curve prior is selected by
    // residual, not by a material class.  A distinctly larger nested edge is
    // used only when it is almost fully edge-supported (inner printed oval ->
    // outer physical carrier).
    if(base.ellipseScore>=.95&&base.rectScore<.90&&base.ellipse){
      let chosenEllipse=base.ellipse,outerUsed=false;
      const candidates=searchOuterEnvelope(cv,src,base.contour,pxPerMM,w,h).filter(x=>x.ratio>=1.35&&x.ratio<=1.70&&x.coverage>=.95&&x.edgeSupport>=.98);
      if(candidates.length){
        const chosen=candidates.sort((a,b)=>a.ratio-b.ratio)[0],c=contourFromPoints(cv,chosen.points);
        if(c.rows>=5){chosenEllipse=cv.fitEllipse(c);outerUsed=true;}c.delete();
      }
      boundary=ellipseContour(cv,chosenEllipse,128);edgeMethod=outerUsed?'fast-curve-outer':'fast-curve';confidence=.82;
    }else{
      const opened=cleanForLine(cv,region.mask,pxPerMM),line=modelConsistency(cv,opened);
      if(line&&line.rectScore>=.85){
        boundary=line.rectContour.clone();edgeMethod='fast-line';confidence=.86;
      }else{
        boundary=smoothFreeform(cv,base.contour,w,h,pxPerMM);edgeMethod='fast-freeform';confidence=.78;
      }
      if(line){line.contour.delete();line.rectContour.delete();line.ellipseMask?.delete?.();}
      opened.delete();
    }
    const mask=filledContour(cv,w,h,boundary),holes=groupCircles(circleCandidates(cv,mask,supportEdges,circlePool,w,h),pxPerMM);
    for(const hole of holes)cv.circle(mask,new cv.Point(hole.x,hole.y),Math.max(1,Math.round(hole.r*1.05)),new cv.Scalar(0),cv.FILLED);
    const bounds=cv.boundingRect(boundary),x=Math.max(0,bounds.x),y=Math.max(0,bounds.y),rw=Math.min(w-x,bounds.width),rh=Math.min(h-y,bounds.height),local=mask.roi(new cv.Rect(x,y,rw,rh)),packed=new cv.Mat();local.copyTo(packed);
    const polygon=contourPoints(boundary).map(([px,py])=>[px-x,py-y]),area=cv.countNonZero(mask);
    out.push({x:x/w,y:y/h,w:rw/w,h:rh/h,pixels:area,evidenceDensity:1,edgeMethod,recognitionConfidence:clamp(confidence+Math.min(holes.length,5)*.015,0,1),apertureCount:holes.length,
      mask:{width:rw,height:rh,alpha:new Uint8Array(packed.data),polygons:[polygon],topologyPreserved:true}});
    local.delete();packed.delete();mask.delete();boundary.delete();
    base.contour.delete();base.rectContour.delete();base.ellipseMask?.delete?.();region.mask.delete();region.contour.delete();
  }
  return out.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
}

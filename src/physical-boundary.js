// Generic physical-boundary refinement for traditional CV recognition.
//
// The input candidate says "an instance exists here"; this module decides
// where the physical carrier boundary is and then refines only the topology
// inside that support. It deliberately does not contain shape-specific rules
// for circles, binder holes, basketball stickers, etc.
//
// Principles:
// 1. search for an outer contour that contains most of the rough candidate;
// 2. prefer contours whose outside ring touches page background;
// 3. optionally straighten only a genuine four-corner contour;
// 4. use GrabCut only inside the selected outer support;
// 5. preserve enclosed background islands from the pixel mask instead of
//    forcing every object to be a simply-connected filled polygon.

export function completePhysicalBoundaries(cv,p,own){
  const w=p.width,h=p.height,rgba=own(cv.matFromArray(h,w,cv.CV_8UC4,p.pixels)),result=[];
  const paperWidth=p.paperWidthMM||210,paperHeight=p.paperHeightMM||297,smallest=p.smallestMM||6;
  const pxPerMM=Math.max(.5,((w/paperWidth)+(h/paperHeight))/2);
  const oddMM=(mm,min=3,max=31)=>{let n=Math.max(min,Math.min(max,Math.round(pxPerMM*mm)));if(!(n&1))n++;return n;};
  const pageBackground=p.backgroundConnected?own(cv.matFromArray(h,w,cv.CV_8UC1,Uint8Array.from(p.backgroundConnected,v=>v?255:0))):null;
  const evidence=p.evidence?own(cv.matFromArray(h,w,cv.CV_8UC1,Uint8Array.from(p.evidence,v=>v?255:0))):null;
  const shadow=p.shadowLikelihood?own(cv.matFromArray(h,w,cv.CV_8UC1,Uint8Array.from(p.shadowLikelihood,v=>v?255:0))):null;
  const contourContains=(contour,x,y)=>{let inside=false;for(let i=0,j=contour.rows-1;i<contour.rows;j=i++){
    const xi=contour.data32S[i*2],yi=contour.data32S[i*2+1],xj=contour.data32S[j*2],yj=contour.data32S[j*2+1];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }return inside;};

  for(const candidate of p.candidates||[]){
    const m=candidate.mask;
    if(!m?.alpha||m.width<4||m.height<4){result.push(candidate);continue;}

    const x0=Math.max(0,Math.round(candidate.x*w)),y0=Math.max(0,Math.round(candidate.y*h));
    const bw=Math.max(1,Math.min(w-x0,Math.round(candidate.w*w))),bh=Math.max(1,Math.min(h-y0,Math.round(candidate.h*h)));
    const minorMM=Math.min(bw/w*paperWidth,bh/h*paperHeight),aspect=Math.max(bw,bh)/Math.max(1,Math.min(bw,bh));
    const touches=x0<=1||y0<=1||x0+bw>=w-1||y0+bh>=h-1;
    // Generic rectification-edge cleanup: only a thin, weak-evidence fragment
    // touching the page boundary is rejected. Real narrow tape can survive if
    // it carries material evidence.
    if(touches&&minorMM<smallest*1.15&&aspect>4&&(candidate.evidenceDensity??1)<.08)continue;

    const margin=Math.max(4,Math.round(pxPerMM*3)),rx=Math.max(0,x0-margin),ry=Math.max(0,y0-margin);
    const rr=Math.min(w,x0+bw+margin),rb=Math.min(h,y0+bh+margin),rw=rr-rx,rh=rb-ry;

    const rough=own(cv.matFromArray(m.height,m.width,cv.CV_8UC1,m.alpha)),roughScaled=own(new cv.Mat());
    cv.resize(rough,roughScaled,new cv.Size(bw,bh),0,0,cv.INTER_NEAREST);
    const roughROI=own(cv.Mat.zeros(rh,rw,cv.CV_8UC1)),target=own(roughROI.roi(new cv.Rect(x0-rx,y0-ry,bw,bh)));roughScaled.copyTo(target);
    const roughArea=Math.max(1,cv.countNonZero(roughROI)),mom=cv.moments(roughROI,true);
    const centerX=mom.m00?mom.m10/mom.m00:x0+bw/2-rx,centerY=mom.m00?mom.m01/mom.m00:y0+bh/2-ry;

    const imageROI=own(rgba.roi(new cv.Rect(rx,ry,rw,rh))),rgb=own(new cv.Mat()),gray=own(new cv.Mat()),grayBlur=own(new cv.Mat());
    const edges=own(new cv.Mat()),lab=own(new cv.Mat()),channels=own(new cv.MatVector()),aBlur=own(new cv.Mat()),bBlur=own(new cv.Mat()),aEdge=own(new cv.Mat()),bEdge=own(new cv.Mat());
    cv.cvtColor(imageROI,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,gray,cv.COLOR_RGB2GRAY);cv.GaussianBlur(gray,grayBlur,new cv.Size(3,3),0);cv.Canny(grayBlur,edges,18,58);
    cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);const aChannel=own(channels.get(1)),bChannel=own(channels.get(2));
    cv.GaussianBlur(aChannel,aBlur,new cv.Size(3,3),0);cv.GaussianBlur(bChannel,bBlur,new cv.Size(3,3),0);cv.Canny(aBlur,aEdge,4,14);cv.Canny(bBlur,bEdge,4,14);
    cv.bitwise_or(edges,aEdge,edges);cv.bitwise_or(edges,bEdge,edges);
    const closeSize=oddMM(.9),closeKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(closeSize,closeSize))),closed=own(new cv.Mat());
    cv.morphologyEx(edges,closed,cv.MORPH_CLOSE,closeKernel);

    const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(closed,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_NONE);
    let best=null;
    for(let i=0;i<contours.size();i++){
      const contour=own(contours.get(i)),area=cv.contourArea(contour);
      if(area<roughArea*.72||area>roughArea*2.8||!contourContains(contour,centerX,centerY))continue;
      const filled=own(cv.Mat.zeros(rh,rw,cv.CV_8UC1)),one=own(new cv.MatVector());one.push_back(contour);cv.drawContours(filled,one,-1,new cv.Scalar(255),cv.FILLED);
      const overlap=own(new cv.Mat());cv.bitwise_and(filled,roughROI,overlap);const coverage=cv.countNonZero(overlap)/roughArea;if(coverage<.82)continue;

      const ringSize=oddMM(1.8,5),ringKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ringSize,ringSize))),ring=own(new cv.Mat());
      cv.dilate(filled,ring,ringKernel);cv.subtract(ring,filled,ring);
      let paperContact=.5;if(pageBackground){const bgROI=own(pageBackground.roi(new cv.Rect(rx,ry,rw,rh))),contact=own(new cv.Mat());cv.bitwise_and(ring,bgROI,contact);paperContact=cv.countNonZero(contact)/Math.max(1,cv.countNonZero(ring));}
      let shadowFraction=0;if(shadow){const shROI=own(shadow.roi(new cv.Rect(rx,ry,rw,rh))),shadowRing=own(new cv.Mat());cv.bitwise_and(ring,shROI,shadowRing);shadowFraction=cv.countNonZero(shadowRing)/Math.max(1,cv.countNonZero(ring));}
      const areaRatio=area/roughArea;if(paperContact<.38&&areaRatio>1.08)continue;if(shadowFraction>.72&&paperContact<.55)continue;

      const expansionPenalty=Math.abs(Math.log(Math.max(.01,areaRatio)));
      const score=coverage*.48+Math.min(1,paperContact/.82)*.34+Math.min(1,areaRatio/1.35)*.10-Math.min(.18,expansionPenalty*.08);
      if(!best||score>best.score)best={score,contour,area,paperContact};
    }
    if(!best){result.push(candidate);continue;}

    let boundary=best.contour,edgeMethod='physical-boundary';
    const outer=own(cv.Mat.zeros(rh,rw,cv.CV_8UC1)),one=own(new cv.MatVector());one.push_back(boundary);cv.drawContours(outer,one,-1,new cv.Scalar(255),cv.FILLED);

    // This is a model-selection prior, not a "rectangle detector" path:
    // only when the selected physical contour itself reduces cleanly to four
    // convex corners do we replace small Canny bites with straight edges.
    const rect=cv.minAreaRect(boundary),rectArea=Math.max(1,rect.size.width*rect.size.height),rectFill=best.area/rectArea,shape=own(new cv.Mat());
    cv.approxPolyDP(boundary,shape,Math.max(2,cv.arcLength(boundary,true)*.018),true);
    if(shape.rows===4&&cv.isContourConvex(shape)&&rectFill>=.72&&best.paperContact>=.58){
      const box=cv.boxPoints(rect),rectContour=own(cv.matFromArray(4,1,cv.CV_32SC2,box.flatMap(point=>[Math.round(point.x),Math.round(point.y)])));
      outer.setTo(new cv.Scalar(0));const rects=own(new cv.MatVector());rects.push_back(rectContour);cv.drawContours(outer,rects,-1,new cv.Scalar(255),cv.FILLED);
      boundary=rectContour;edgeMethod='physical-rectangle';
    }

    // Topology is inferred by the same graph-cut refinement for every shape.
    // Any page-like enclosed region may remain background, regardless of
    // whether it is circular, rectangular, or irregular.
    const gc=own(new cv.Mat(rh,rw,cv.CV_8UC1,new cv.Scalar(cv.GC_BGD)));let strongFG=0;
    for(let py=0;py<rh;py++)for(let px=0;px<rw;px++){
      const at=py*rw+px;if(!outer.data[at])continue;gc.data[at]=cv.GC_PR_FGD;
      const global=(ry+py)*w+(rx+px);
      if(evidence?.data[global]){gc.data[at]=cv.GC_FGD;strongFG++;}
      else if(shadow?.data[global])gc.data[at]=cv.GC_PR_BGD;
    }
    const refined=own(new cv.Mat());outer.copyTo(refined);
    if(strongFG>=10){
      const bgModel=own(new cv.Mat()),fgModel=own(new cv.Mat());cv.grabCut(rgb,gc,new cv.Rect(),bgModel,fgModel,3,cv.GC_INIT_WITH_MASK);
      for(let i=0;i<gc.data.length;i++)refined.data[i]=outer.data[i]&&(gc.data[i]===cv.GC_FGD||gc.data[i]===cv.GC_PR_FGD)?255:0;
      const labels=own(new cv.Mat()),stats=own(new cv.Mat()),centroids=own(new cv.Mat()),count=cv.connectedComponentsWithStats(refined,labels,stats,centroids,8,cv.CV_32S);
      let largestLabel=0,largestArea=0;for(let label=1;label<count;label++){const a=stats.data32S[label*5+4];if(a>largestArea){largestArea=a;largestLabel=label;}}
      if(largestLabel&&largestArea>=cv.countNonZero(outer)*.62){for(let i=0;i<labels.data32S.length;i++)refined.data[i]=labels.data32S[i]===largestLabel?255:0;}else outer.copyTo(refined);
    }

    const bounds=cv.boundingRect(boundary),x=Math.max(0,bounds.x),y=Math.max(0,bounds.y),fw=Math.min(rw-x,bounds.width),fh=Math.min(rh-y,bounds.height);
    const local=own(refined.roi(new cv.Rect(x,y,fw,fh))),packed=own(new cv.Mat());local.copyTo(packed);
    const poly=own(new cv.Mat());cv.approxPolyDP(boundary,poly,Math.max(.7,cv.arcLength(boundary,true)*.0015),true);
    const polygon=Array.from({length:poly.rows},(_,i)=>[poly.data32S[i*2]-x,poly.data32S[i*2+1]-y]);
    result.push({...candidate,x:(rx+x)/w,y:(ry+y)/h,w:fw/w,h:fh/h,pixels:cv.countNonZero(refined),edgeMethod,
      mask:{width:fw,height:fh,alpha:new Uint8Array(packed.data),polygons:[polygon],topologyPreserved:true}});
  }
  return result;
}

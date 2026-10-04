// Multi-scale reconstruction of fragmented physical boundaries.
//
// This module is intentionally category-free. It does not know about labels,
// binder sheets, basketball stickers or punch holes. It asks a single question:
// can several rough instance fragments be explained by one well-supported,
// paper-facing closed physical carrier after bridging only short edge gaps?
//
// Energy terms:
// - edgeSupportRatio: how much of the reconstructed perimeter is backed by a
//   real gray/Lab edge before gap closing (line/curve continuation);
// - closureScaleMM: how much physical gap closing was needed;
// - paperContactRatio: whether the outside ring is the rectified page;
// - interiorBackgroundRatio: how much page-connected background leaked inside
//   the proposed carrier (large values penalize contours around loose objects);
// - fillRatio: a weak compactness guard, never a material-class requirement.

const intersection=(a,b)=>{
  const l=Math.max(a.x,b.x),t=Math.max(a.y,b.y),r=Math.min(a.x+a.w,b.x+b.w),d=Math.min(a.y+a.h,b.y+b.h);
  return Math.max(0,r-l)*Math.max(0,d-t);
};
const area=a=>Math.max(0,a.w)*Math.max(0,a.h);
const containsCenter=(outer,inner)=>{
  const x=inner.x+inner.w/2,y=inner.y+inner.h/2;
  return x>=outer.x&&x<=outer.x+outer.w&&y>=outer.y&&y<=outer.y+outer.h;
};
const iou=(a,b)=>{
  const inter=intersection(a,b);return inter/Math.max(1e-9,area(a)+area(b)-inter);
};

export function reconstructFragmentedBoundaries(cv,p,own){
  const w=p.width,h=p.height,paperWidth=p.paperWidthMM||210,paperHeight=p.paperHeightMM||297,smallest=p.smallestMM||6;
  const pxPerMM=Math.max(.5,((w/paperWidth)+(h/paperHeight))/2);
  const oddMM=(mm,min=3,max=51)=>{let n=Math.max(min,Math.min(max,Math.round(pxPerMM*mm)));if(!(n&1))n++;return n;};
  const src=own(cv.matFromArray(h,w,cv.CV_8UC4,p.pixels)),gray=own(new cv.Mat()),blurred=own(new cv.Mat()),baseEdges=own(new cv.Mat()),rgb=own(new cv.Mat()),lab=own(new cv.Mat()),channels=own(new cv.MatVector()),aBlur=own(new cv.Mat()),bBlur=own(new cv.Mat()),aEdge=own(new cv.Mat()),bEdge=own(new cv.Mat());
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blurred,new cv.Size(5,5),0);cv.Canny(blurred,baseEdges,20,65);
  cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);
  const aChannel=own(channels.get(1)),bChannel=own(channels.get(2));cv.GaussianBlur(aChannel,aBlur,new cv.Size(3,3),0);cv.GaussianBlur(bChannel,bBlur,new cv.Size(3,3),0);cv.Canny(aBlur,aEdge,4,14);cv.Canny(bBlur,bEdge,4,14);cv.bitwise_or(baseEdges,aEdge,baseEdges);cv.bitwise_or(baseEdges,bEdge,baseEdges);

  const supportKernelSize=oddMM(.75),supportKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(supportKernelSize,supportKernelSize))),supportEdges=own(new cv.Mat());
  cv.dilate(baseEdges,supportEdges,supportKernel);
  const proposals=[];
  const refineExternal=(seed,seedArea,seedBounds,closed)=>{
    const pad=Math.max(3,Math.round(pxPerMM*2)),rx=Math.max(0,seedBounds.x-pad),ry=Math.max(0,seedBounds.y-pad),rr=Math.min(w,seedBounds.x+seedBounds.width+pad),rb=Math.min(h,seedBounds.y+seedBounds.height+pad),rw=rr-rx,rh=rb-ry;
    const roi=own(closed.roi(new cv.Rect(rx,ry,rw,rh))),external=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(roi,external,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
    const cx=seedBounds.x+seedBounds.width/2-rx,cy=seedBounds.y+seedBounds.height/2-ry;let bestPoints=null,bestScore=-Infinity;
    for(let i=0;i<external.size();i++){
      const contour=own(external.get(i)),a=cv.contourArea(contour);if(a<seedArea*.40||a>seedArea*2.20)continue;
      const inside=cv.pointPolygonTest(contour,new cv.Point(cx,cy),false)>=0,score=(inside?1:0)-Math.abs(Math.log(Math.max(a,1)/Math.max(seedArea,1)))*.20;
      if(score<=bestScore)continue;bestScore=score;bestPoints=Array.from({length:contour.rows},(_,j)=>[contour.data32S[j*2]+rx,contour.data32S[j*2+1]+ry]);
    }
    return bestPoints?.length>=3?own(cv.matFromArray(bestPoints.length,1,cv.CV_32SC2,bestPoints.flat())):seed;
  };

  for(const closureScaleMM of [.65,1.0,1.45,2.0,2.8,3.8]){
    const closeSize=oddMM(closureScaleMM),growSize=oddMM(.35),closeKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(closeSize,closeSize))),growKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(growSize,growSize))),closed=own(new cv.Mat());
    cv.morphologyEx(baseEdges,closed,cv.MORPH_CLOSE,closeKernel,new cv.Point(-1,-1),2);cv.dilate(closed,closed,growKernel);
    const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());cv.findContours(closed,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);

    for(let i=0;i<contours.size();i++){
      const seed=own(contours.get(i)),seedPixels=cv.contourArea(seed);if(seedPixels<32||seedPixels>w*h*.55)continue;
      const seedBounds=cv.boundingRect(seed),contour=refineExternal(seed,seedPixels,seedBounds,closed),pixels=cv.contourArea(contour);if(pixels<32||pixels>w*h*.55)continue;
      const b=cv.boundingRect(contour),widthMM=b.width/w*paperWidth,heightMM=b.height/h*paperHeight;
      if(widthMM<smallest||heightMM<smallest||b.width>w*.94||b.height>h*.94||b.x<2||b.y<2||b.x+b.width>w-2||b.y+b.height>h-2)continue;
      const box={x:b.x/w,y:b.y/h,w:b.width/w,h:b.height/h},matches=(p.instances||[]).filter(instance=>containsCenter(box,instance)||intersection(box,instance)/Math.max(1e-9,area(instance))>.28);
      if(!matches.length)continue;

      const filled=own(cv.Mat.zeros(h,w,cv.CV_8UC1)),one=own(new cv.MatVector());one.push_back(contour);cv.drawContours(filled,one,-1,new cv.Scalar(255),cv.FILLED);
      const boundary=own(cv.Mat.zeros(h,w,cv.CV_8UC1));cv.drawContours(boundary,one,-1,new cv.Scalar(255),1);
      const supported=own(new cv.Mat());cv.bitwise_and(boundary,supportEdges,supported);
      const boundaryPixels=Math.max(1,cv.countNonZero(boundary)),edgeSupportRatio=cv.countNonZero(supported)/boundaryPixels;
      let boundaryShadow=0;for(let yy=b.y;yy<b.y+b.height;yy++)for(let xx=b.x;xx<b.x+b.width;xx++){const at=yy*w+xx;if(boundary.data[at]&&p.shadowLikelihood?.[at])boundaryShadow++;}
      const boundaryShadowFraction=boundaryShadow/boundaryPixels;

      let inside=0,insidePage=0,insideEvidence=0;
      for(let yy=b.y;yy<b.y+b.height;yy++)for(let xx=b.x;xx<b.x+b.width;xx++){
        const at=yy*w+xx;if(!filled.data[at])continue;inside++;if(p.backgroundConnected?.[at])insidePage++;if(p.evidence?.[at])insideEvidence++;
      }
      const interiorBackgroundRatio=insidePage/Math.max(1,inside),insideEvidenceRatio=insideEvidence/Math.max(1,inside);
      const ringSize=oddMM(1.8,5),ringRadius=Math.ceil(ringSize/2),ringKernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ringSize,ringSize))),ring=own(new cv.Mat());cv.dilate(filled,ring,ringKernel);cv.subtract(ring,filled,ring);
      let ringN=0,paperN=0;
      for(let yy=Math.max(0,b.y-ringRadius);yy<Math.min(h,b.y+b.height+ringRadius);yy++)for(let xx=Math.max(0,b.x-ringRadius);xx<Math.min(w,b.x+b.width+ringRadius);xx++){
        const at=yy*w+xx;if(!ring.data[at])continue;ringN++;if(p.backgroundConnected?.[at])paperN++;
      }
      const paperContactRatio=paperN/Math.max(1,ringN),fillRatio=pixels/Math.max(1,b.width*b.height),bridgeFraction=1-edgeSupportRatio;
      const matchedOccupancy=matches.reduce((sum,instance)=>sum+intersection(box,instance),0)/Math.max(1e-9,area(box));
      const largestMatchShare=Math.max(...matches.map(instance=>area(instance)/Math.max(1e-9,area(box))));
      let matchedPairOverlap=0;for(let a=0;a<matches.length;a++)for(let b=a+1;b<matches.length;b++)matchedPairOverlap=Math.max(matchedPairOverlap,intersection(matches[a],matches[b])/Math.max(1e-9,Math.min(area(matches[a]),area(matches[b]))));
      // Large-scale closures are allowed only when the actual original edge
      // still supports most of the resulting perimeter.
      if(edgeSupportRatio<.38)continue;
      if(closureScaleMM>2.0&&edgeSupportRatio<.52)continue;
      if(fillRatio<.24&&edgeSupportRatio<.66)continue;
      if(matches.length>1&&interiorBackgroundRatio>.58&&edgeSupportRatio<.62)continue;
      // A reconstructed carrier is meant to explain FRAGMENTS. If several
      // already-substantial instance boxes nearly fill the proposal, they are
      // more likely neighbouring objects than fragments of one carrier. This
      // rejects the classic "oval + nearby card wrapped by one contour" error
      // without relying on either object's shape or class.
      if(matches.length>1&&matchedOccupancy>.72&&matchedPairOverlap<.18)continue;

      const matchReward=Math.min(1,matches.length/3),scalePenalty=Math.min(.18,closureScaleMM*.035),bridgePenalty=Math.min(.28,bridgeFraction*.34),pagePenalty=Math.min(.18,interiorBackgroundRatio*.20);
      const reconstructionScore=edgeSupportRatio*.43+Math.min(1,paperContactRatio/.82)*.22+Math.min(1,fillRatio/.72)*.12+matchReward*.13+Math.min(1,insideEvidenceRatio/.20)*.10-scalePenalty-bridgePenalty-pagePenalty;
      if(reconstructionScore<.28)continue;

      let physical=contour,edgeMethod='boundary-reconstruction';
      const rect=cv.minAreaRect(contour),rectArea=Math.max(1,rect.size.width*rect.size.height),rectFill=pixels/rectArea,shape=own(new cv.Mat());cv.approxPolyDP(contour,shape,Math.max(2,cv.arcLength(contour,true)*.018),true);
      const edgeCertainStraight=rectFill>=.82&&edgeSupportRatio>=.75&&boundaryShadowFraction<=.35;
      if(shape.rows===4&&cv.isContourConvex(shape)&&rectFill>=.72&&(paperContactRatio>=.55||edgeCertainStraight)){
        const points=cv.boxPoints(rect),straight=own(cv.matFromArray(4,1,cv.CV_32SC2,points.flatMap(point=>[Math.round(point.x),Math.round(point.y)])));
        filled.setTo(new cv.Scalar(0));const rects=own(new cv.MatVector());rects.push_back(straight);cv.drawContours(filled,rects,-1,new cv.Scalar(255),cv.FILLED);physical=straight;edgeMethod='boundary-reconstruction-straight';
      }
      const bounds=cv.boundingRect(physical),x=Math.max(0,bounds.x-2),y=Math.max(0,bounds.y-2),rw=Math.min(w,bounds.x+bounds.width+2)-x,rh=Math.min(h,bounds.y+bounds.height+2)-y,local=own(filled.roi(new cv.Rect(x,y,rw,rh))),packed=own(new cv.Mat());local.copyTo(packed);
      const poly=own(new cv.Mat());cv.approxPolyDP(physical,poly,Math.max(.7,cv.arcLength(physical,true)*.0015),true);const polygon=Array.from({length:poly.rows},(_,j)=>[poly.data32S[j*2]-x,poly.data32S[j*2+1]-y]);
      proposals.push({x:x/w,y:y/h,w:rw/w,h:rh/h,pixels,edgeMethod,boundaryReconstruction:true,reconstructionScore,edgeSupportRatio,closureScaleMM,bridgeFraction,paperContactRatio,interiorBackgroundRatio,insideEvidenceRatio,fillRatio,matchedInstances:matches.length,matchedOccupancy,matchedPairOverlap,largestMatchShare,boundaryShadowFraction,mask:{width:rw,height:rh,alpha:new Uint8Array(packed.data),polygons:[polygon]}});
    }
  }

  // Multi-scale deduplication: prefer lower energy / higher score for the same
  // physical carrier, without suppressing a genuinely larger enclosing object.
  proposals.sort((a,b)=>b.reconstructionScore-a.reconstructionScore||b.pixels-a.pixels);
  const kept=[];
  for(const proposal of proposals){
    if(kept.some(existing=>iou(proposal,existing)>.88&&Math.max(area(proposal),area(existing))/Math.max(1e-9,Math.min(area(proposal),area(existing)))<1.35))continue;
    kept.push(proposal);if(kept.length>=64)break;
  }
  return kept;
}

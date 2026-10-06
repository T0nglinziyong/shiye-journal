// Outside-in physical carrier recovery.
//
// Unlike colour-driven seed expansion, this module starts with a family of
// closed supports OUTSIDE the known printed/material seed and chooses the
// outermost well-supported physical boundary. Internal print edges therefore
// cannot stop the search before the real carrier edge.
//
// This is a discrete morphological analogue of an outside-in geodesic active
// contour. It deliberately uses only OpenCV.js primitives already shipped by
// Shiye: dilation, contours, distance transform and physical-scale scoring.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const contourPoints=c=>Array.from({length:c.rows},(_,i)=>[c.data32S[i*2],c.data32S[i*2+1]]);

function shiftedContour(cv,c,dx,dy){
  const pts=[];for(let i=0;i<c.rows;i++)pts.push(c.data32S[i*2]+dx,c.data32S[i*2+1]+dy);
  return cv.matFromArray(c.rows,1,cv.CV_32SC2,pts);
}
function largestExternal(cv,mask){
  const cs=new cv.MatVector(),hh=new cv.Mat();cv.findContours(mask,cs,hh,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
  let best=null,area=0;
  for(let i=0;i<cs.size();i++){const q=cs.get(i),a=Math.abs(cv.contourArea(q));if(a>area){best?.delete?.();best=q;area=a;}else q.delete();}
  cs.delete();hh.delete();return {contour:best,area};
}
function filledMask(cv,c,w,h){
  const m=cv.Mat.zeros(h,w,cv.CV_8UC1),v=new cv.MatVector();v.push_back(c);cv.drawContours(m,v,-1,new cv.Scalar(255),cv.FILLED);v.delete();return m;
}
function boundarySupport(cv,contour,edgeDistance,seedMask,w,h){
  const pts=contourPoints(contour),stride=Math.max(1,Math.ceil(pts.length/260));let support=0,soft=0,n=0;
  for(let i=0;i<pts.length;i+=stride){
    const x=clamp(pts[i][0],0,w-1),y=clamp(pts[i][1],0,h-1),d=edgeDistance.data32F[y*w+x];n++;
    if(d<=1.6)support++;if(d<=3.2)soft++;
  }
  const mask=filledMask(cv,contour,w,h),seedArea=Math.max(1,cv.countNonZero(seedMask)),overlap=new cv.Mat();cv.bitwise_and(mask,seedMask,overlap);
  const seedCoverage=cv.countNonZero(overlap)/seedArea,area=cv.countNonZero(mask);overlap.delete();mask.delete();
  return {hard:support/Math.max(1,n),soft:soft/Math.max(1,n),seedCoverage,area};
}

export function recoverCarrierOutsideIn(cv,{contour,edges,w,h,pxPerMM,maxExpansionMM=18}){
  const b=cv.boundingRect(contour),pad=Math.max(Math.round(pxPerMM*4),Math.round(pxPerMM*(maxExpansionMM+4))),x0=Math.max(0,b.x-pad),y0=Math.max(0,b.y-pad),x1=Math.min(w,b.x+b.width+pad),y1=Math.min(h,b.y+b.height+pad),rw=x1-x0,rh=y1-y0;
  if(rw<12||rh<12)return {contour,owned:false,recovered:false,reason:'roi-too-small'};
  const shifted=shiftedContour(cv,contour,-x0,-y0),seed=filledMask(cv,shifted,rw,rh),seedArea=Math.max(1,cv.countNonZero(seed)),edgeROI=edges.roi(new cv.Rect(x0,y0,rw,rh)),inv=new cv.Mat(),edgeDistance=new cv.Mat();
  cv.threshold(edgeROI,inv,0,255,cv.THRESH_BINARY_INV);cv.distanceTransform(inv,edgeDistance,cv.DIST_L2,5);

  // Generate nested supports from outside to inside. A true carrier boundary
  // should appear as a local maximum of perimeter edge support while still
  // enclosing virtually all of the stable seed.
  const radiiMM=[18,15,12,10,8,6,4,3,2,1],candidates=[];
  for(const mm of radiiMM){
    const r=Math.max(1,Math.round(pxPerMM*mm)),k=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(r*2+1,r*2+1)),grown=new cv.Mat();cv.dilate(seed,grown,k);k.delete();
    const found=largestExternal(cv,grown);grown.delete();if(!found.contour)continue;
    const q=boundarySupport(cv,found.contour,edgeDistance,seed,rw,rh),ratio=q.area/seedArea;
    // Large supports get no reward merely for being large. We seek an edge
    // support peak, with a weak preference for an outer solution when two
    // nested contours have comparable support.
    const plausible=ratio>=1.03&&ratio<=6&&q.seedCoverage>=.985;
    const score=q.hard*.58+q.soft*.30+(plausible?.08:-.30)+Math.min(mm,12)/12*.04;
    candidates.push({mm,contour:found.contour,...q,ratio,score,plausible});
  }
  const valid=candidates.filter(q=>q.plausible&&q.soft>=.18);
  if(!valid.length){for(const q of candidates)q.contour.delete();cleanup();return {contour,owned:false,recovered:false,reason:'no-supported-outer-boundary'};}

  // A physical edge should form a support peak relative to neighbouring
  // dilation levels. This rejects arbitrary far-away page edges and avoids
  // collapsing onto strong internal print.
  valid.sort((a,b)=>b.mm-a.mm);let best=null,bestScore=-Infinity;
  for(let i=0;i<valid.length;i++){
    const q=valid[i],outer=i>0?valid[i-1]:null,inner=i+1<valid.length?valid[i+1]:null;
    const localPeak=q.soft-Math.max(outer?.soft||0,inner?.soft||0)*.45;
    const score=q.score+Math.max(0,localPeak)*.28;
    if(score>bestScore){best=q;bestScore=score;}
  }
  // Require a meaningful improvement over the seed neighbourhood. If the
  // edge field never supports an outer perimeter, keep the validated baseline.
  const seedFound=largestExternal(cv,seed),seedQ=seedFound.contour?boundarySupport(cv,seedFound.contour,edgeDistance,seed,rw,rh):{soft:0,hard:0};seedFound.contour?.delete?.();
  if(best.soft<Math.max(.22,seedQ.soft+.035)){
    for(const q of candidates)q.contour.delete();cleanup();return {contour,owned:false,recovered:false,reason:'outer-edge-not-better-than-seed',bestSoft:best.soft,seedSoft:seedQ.soft};
  }

  // Convert the selected ROI contour to page coordinates. Mild smoothing is
  // left to the existing downstream free-form regularizer.
  const pts=contourPoints(best.contour).map(([x,y])=>[x+x0,y+y0]),result=cv.matFromArray(pts.length,1,cv.CV_32SC2,pts.flat());
  const selected={radiusMM:best.mm,edgeSupport:best.hard,softEdgeSupport:best.soft,areaRatio:best.ratio,seedCoverage:best.seedCoverage};
  for(const q of candidates)q.contour.delete();cleanup();
  return {contour:result,owned:true,recovered:true,...selected};

  function cleanup(){shifted.delete();seed.delete();edgeROI.delete();inv.delete();edgeDistance.delete();}
}

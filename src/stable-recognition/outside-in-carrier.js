// Outside-in physical carrier recovery.
//
// Search order is outside-in, but the returned contour MUST come from observed
// image edges. Morphological dilation is used only to bridge short photographed
// gaps; it never defines the final carrier shape.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const contourPoints=c=>Array.from({length:c.rows},(_,i)=>[c.data32S[i*2],c.data32S[i*2+1]]);
function shiftedContour(cv,c,dx,dy){const p=[];for(let i=0;i<c.rows;i++)p.push(c.data32S[i*2]+dx,c.data32S[i*2+1]+dy);return cv.matFromArray(c.rows,1,cv.CV_32SC2,p);}
function maskOf(cv,c,w,h){const m=cv.Mat.zeros(h,w,cv.CV_8UC1),v=new cv.MatVector();v.push_back(c);cv.drawContours(m,v,-1,new cv.Scalar(255),cv.FILLED);v.delete();return m;}
function metrics(cv,c,seed,edgeSupport,w,h){
  const m=maskOf(cv,c,w,h),overlap=new cv.Mat();cv.bitwise_and(m,seed,overlap);
  const seedArea=Math.max(1,cv.countNonZero(seed)),area=Math.max(1,cv.countNonZero(m)),coverage=cv.countNonZero(overlap)/seedArea;
  const boundary=cv.Mat.zeros(h,w,cv.CV_8UC1),v=new cv.MatVector(),hit=new cv.Mat();v.push_back(c);cv.drawContours(boundary,v,-1,new cv.Scalar(255),1);cv.bitwise_and(boundary,edgeSupport,hit);
  const support=cv.countNonZero(hit)/Math.max(1,cv.countNonZero(boundary));
  m.delete();overlap.delete();boundary.delete();v.delete();hit.delete();return {coverage,area,support,ratio:area/seedArea};
}

export function recoverCarrierOutsideIn(cv,{contour,edges,w,h,pxPerMM,maxExpansionMM=22}){
  const b=cv.boundingRect(contour),pad=Math.max(Math.round(pxPerMM*5),Math.round(pxPerMM*(maxExpansionMM+3))),x0=Math.max(0,b.x-pad),y0=Math.max(0,b.y-pad),x1=Math.min(w,b.x+b.width+pad),y1=Math.min(h,b.y+b.height+pad),rw=x1-x0,rh=y1-y0;
  if(rw<12||rh<12)return {contour,owned:false,recovered:false,reason:'roi-too-small'};
  const shifted=shiftedContour(cv,contour,-x0,-y0),seed=maskOf(cv,shifted,rw,rh),edgeROI=edges.roi(new cv.Rect(x0,y0,rw,rh));
  // Edge support is slightly dilated only for scoring tolerance. Candidate
  // geometry still comes from the observed/closed edge contour itself.
  const supportK=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5)),support=new cv.Mat();cv.dilate(edgeROI,support,supportK);
  const candidates=[];
  for(const closeMM of [.35,.7,1.2,2.0,3.2]){
    const r=Math.max(1,Math.round(pxPerMM*closeMM)),k=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(r*2+1,r*2+1)),closed=new cv.Mat(),cs=new cv.MatVector(),hh=new cv.Mat();
    cv.morphologyEx(edgeROI,closed,cv.MORPH_CLOSE,k);cv.findContours(closed,cs,hh,cv.RETR_LIST,cv.CHAIN_APPROX_NONE);
    for(let i=0;i<cs.size();i++){
      const q=cs.get(i),a=Math.abs(cv.contourArea(q));if(a<24){q.delete();continue;}
      const m=metrics(cv,q,seed,support,rw,rh);
      // A carrier candidate must contain essentially all stable print. This
      // single condition eliminates internal basketball/person/text edges.
      if(m.coverage<.975||m.ratio<1.04||m.ratio>7){q.delete();continue;}
      const box=cv.boundingRect(q),frame=Math.max(2,Math.round(pxPerMM*1.5));
      if(box.x<frame||box.y<frame||box.x+box.width>rw-frame||box.y+box.height>rh-frame){q.delete();continue;}
      // Prefer real perimeter support. Area receives only a weak saturating
      // reward, so a distant unrelated enclosure cannot win just by being big.
      const expansion=Math.min(1,Math.log(Math.max(1,m.ratio))/Math.log(4));
      const score=m.support*.72+m.coverage*.18+expansion*.10-closeMM*.008;
      candidates.push({contour:q,closeMM,...m,score});
    }
    k.delete();closed.delete();cs.delete();hh.delete();
  }
  if(!candidates.length){cleanup();return {contour,owned:false,recovered:false,reason:'no-enclosing-edge-loop'};}

  // Deduplicate nested copies, then choose the OUTERMOST contour whose support
  // is statistically competitive with the best observed perimeter. This is the
  // crucial outside-in rule: internal print cannot win, and a slightly softer
  // white cut edge is allowed to beat a tighter dark printed edge.
  candidates.sort((a,b)=>b.support-a.support||b.score-a.score);const bestSupport=candidates[0].support;
  const competitive=candidates.filter(q=>q.support>=Math.max(.20,bestSupport*.72)&&q.score>=candidates[0].score-.16);
  competitive.sort((a,b)=>b.area-a.area||b.support-a.support);
  const best=competitive[0]||candidates[0];
  if(best.support<.20){for(const q of candidates)q.contour.delete();cleanup();return {contour,owned:false,recovered:false,reason:'weak-physical-edge',edgeSupport:best.support};}

  const pts=contourPoints(best.contour).map(([x,y])=>[x+x0,y+y0]),result=cv.matFromArray(pts.length,1,cv.CV_32SC2,pts.flat());
  const out={contour:result,owned:true,recovered:true,edgeSupport:best.support,areaRatio:best.ratio,seedCoverage:best.coverage,closureScaleMM:best.closeMM,candidateCount:candidates.length};
  for(const q of candidates)q.contour.delete();cleanup();return out;
  function cleanup(){shifted.delete();seed.delete();edgeROI.delete();supportK.delete();support.delete();}
}

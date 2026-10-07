// Local carrier recovery for one already-discovered material identity.
//
// This is deliberately NOT an instance detector. It receives one authoritative
// identity, expands a small physical ROI around it, and uses rectangle-initialized
// GrabCut to recover a pale/white carrier that the page-connected foreground
// mask could not fully retain.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const contourPoints=c=>Array.from({length:c.rows},(_,i)=>[c.data32S[i*2],c.data32S[i*2+1]]);

export function recoverLowFillCarrier(cv,p){
  const pageW=p.width,pageH=p.height,candidate=p.candidate;
  if(!candidate)return null;
  const paperWidthMM=p.paperWidthMM||210,paperHeightMM=p.paperHeightMM||297,
    pxPerMM=Math.max(.5,((pageW/paperWidthMM)+(pageH/paperHeightMM))/2),
    pad=Math.max(4,Math.round(pxPerMM*(p.padMM??15))),
    gx=Math.round(candidate.x*pageW),gy=Math.round(candidate.y*pageH),
    gw=Math.max(1,Math.round(candidate.w*pageW)),gh=Math.max(1,Math.round(candidate.h*pageH)),
    x0=Math.max(0,gx-pad),y0=Math.max(0,gy-pad),
    x1=Math.min(pageW,gx+gw+pad),y1=Math.min(pageH,gy+gh+pad),
    rw=x1-x0,rh=y1-y0;

  const src=cv.matFromArray(pageH,pageW,cv.CV_8UC4,p.pixels),roi=src.roi(new cv.Rect(x0,y0,rw,rh)),
    rgb=new cv.Mat(),gc=new cv.Mat(rh,rw,cv.CV_8UC1,new cv.Scalar(cv.GC_BGD)),
    bg=new cv.Mat(),fg=new cv.Mat(),out=cv.Mat.zeros(rh,rw,cv.CV_8UC1);
  try{
    cv.cvtColor(roi,rgb,cv.COLOR_RGBA2RGB);
    const border=Math.max(2,Math.round(Math.min(rw,rh)*.03)),
      rect=new cv.Rect(border,border,Math.max(1,rw-2*border),Math.max(1,rh-2*border));
    cv.grabCut(rgb,gc,rect,bg,fg,3,cv.GC_INIT_WITH_RECT);
    for(let i=0;i<gc.data.length;i++)if(gc.data[i]===cv.GC_FGD||gc.data[i]===cv.GC_PR_FGD)out.data[i]=255;

    const contours=new cv.MatVector(),hierarchy=new cv.Mat();
    cv.findContours(out,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_NONE);
    const centerX=gx+gw/2-x0,centerY=gy+gh/2-y0;
    let best=null,bestArea=0;
    for(let i=0;i<contours.size();i++){
      const q=contours.get(i),area=Math.abs(cv.contourArea(q)),
        contains=cv.pointPolygonTest(q,new cv.Point(centerX,centerY),false)>=0;
      if(contains&&area>bestArea){best?.delete?.();best=q;bestArea=area;}else q.delete();
    }
    contours.delete();hierarchy.delete();
    if(!best)return null;

    const bounds=cv.boundingRect(best),mask=cv.Mat.zeros(rh,rw,cv.CV_8UC1),v=new cv.MatVector();
    v.push_back(best);cv.drawContours(mask,v,-1,new cv.Scalar(255),cv.FILLED);v.delete();
    const local=mask.roi(new cv.Rect(bounds.x,bounds.y,bounds.width,bounds.height)),
      packed=new cv.Mat();
    local.copyTo(packed);
    const poly=contourPoints(best).map(([x,y])=>[x-bounds.x,y-bounds.y]);
    const result={
      ...candidate,
      x:(x0+bounds.x)/pageW,y:(y0+bounds.y)/pageH,
      w:bounds.width/pageW,h:bounds.height/pageH,
      pixels:cv.countNonZero(mask),
      edgeMethod:'local-carrier-grabcut',
      boundaryFinalized:true,
      boundaryCompletion:'low-fill-grabcut',
      carrierGrabCutPadMM:p.padMM??15,
      mask:{width:bounds.width,height:bounds.height,alpha:new Uint8Array(packed.data),polygons:[poly],topologyPreserved:true}
    };
    packed.delete();local.delete();mask.delete();best.delete();
    return result;
  }catch{
    return null;
  }finally{
    out.delete();bg.delete();fg.delete();gc.delete();rgb.delete();roi.delete();src.delete();
  }
}

// Shape-agnostic topology refinement for traditional CV recognition.
//
// Physical-boundary discovery belongs to the enclosure stage. This module does
// not try to recognise "ellipse", "binder hole", "basketball sticker", etc.
// It accepts the fused physical support as a hard outer maximum, then lets one
// graph-cut rule decide which pixels inside that support are foreground.
//
// Separation of responsibilities:
// - enclosures answer WHERE the physical carrier ends;
// - watershed/GrabCut answer WHICH pixels belong to the material;
// - this pass preserves arbitrary topology (holes/windows/die-cuts) instead of
//   flattening every material into one filled polygon.

export function completePhysicalBoundaries(cv,p,own){
  const w=p.width,h=p.height,rgba=own(cv.matFromArray(h,w,cv.CV_8UC4,p.pixels)),result=[];
  const paperWidth=p.paperWidthMM||210,paperHeight=p.paperHeightMM||297,smallest=p.smallestMM||6;
  const pxPerMM=Math.max(.5,((w/paperWidth)+(h/paperHeight))/2);
  const evidence=p.evidence?own(cv.matFromArray(h,w,cv.CV_8UC1,Uint8Array.from(p.evidence,v=>v?255:0))):null;
  const shadow=p.shadowLikelihood?own(cv.matFromArray(h,w,cv.CV_8UC1,Uint8Array.from(p.shadowLikelihood,v=>v?255:0))):null;

  for(const candidate of p.candidates||[]){
    const m=candidate.mask;if(!m?.alpha||m.width<2||m.height<2){result.push(candidate);continue;}
    const x=Math.max(0,Math.round(candidate.x*w)),y=Math.max(0,Math.round(candidate.y*h));
    const bw=Math.max(1,Math.min(w-x,Math.round(candidate.w*w))),bh=Math.max(1,Math.min(h-y,Math.round(candidate.h*h)));
    const minorMM=Math.min(bw/w*paperWidth,bh/h*paperHeight),aspect=Math.max(bw,bh)/Math.max(1,Math.min(bw,bh));
    const touches=x<=1||y<=1||x+bw>=w-1||y+bh>=h-1;
    // Generic rectification-edge cleanup: only a thin, weak-evidence fragment
    // touching the page boundary is rejected. Real narrow tape can survive if
    // it carries actual material evidence.
    if(touches&&minorMM<smallest*1.15&&aspect>4&&(candidate.evidenceDensity??1)<.08)continue;

    const margin=Math.max(3,Math.round(pxPerMM*1.5)),rx=Math.max(0,x-margin),ry=Math.max(0,y-margin);
    const rr=Math.min(w,x+bw+margin),rb=Math.min(h,y+bh+margin),rw=rr-rx,rh=rb-ry,ox=x-rx,oy=y-ry;
    const outerSource=own(cv.matFromArray(m.height,m.width,cv.CV_8UC1,m.alpha)),outerScaled=own(new cv.Mat());
    cv.resize(outerSource,outerScaled,new cv.Size(bw,bh),0,0,cv.INTER_NEAREST);
    const outer=own(cv.Mat.zeros(rh,rw,cv.CV_8UC1)),outerTarget=own(outer.roi(new cv.Rect(ox,oy,bw,bh)));outerScaled.copyTo(outerTarget);
    const outerArea=cv.countNonZero(outer);if(!outerArea)continue;

    const imageROI=own(rgba.roi(new cv.Rect(rx,ry,rw,rh))),rgb=own(new cv.Mat());cv.cvtColor(imageROI,rgb,cv.COLOR_RGBA2RGB);
    const gc=own(new cv.Mat(rh,rw,cv.CV_8UC1,new cv.Scalar(cv.GC_BGD)));let strongFG=0;
    for(let py=0;py<rh;py++)for(let px=0;px<rw;px++){
      const local=py*rw+px;if(!outer.data[local])continue;gc.data[local]=cv.GC_PR_FGD;
      const global=(ry+py)*w+(rx+px);
      if(evidence?.data[global]){gc.data[local]=cv.GC_FGD;strongFG++;}
      else if(shadow?.data[global])gc.data[local]=cv.GC_PR_BGD;
    }

    const refined=own(new cv.Mat());outer.copyTo(refined);
    const background=rw*rh-outerArea;
    if(strongFG>=10&&background>=10){
      const bgModel=own(new cv.Mat()),fgModel=own(new cv.Mat());cv.grabCut(rgb,gc,new cv.Rect(),bgModel,fgModel,3,cv.GC_INIT_WITH_MASK);
      for(let i=0;i<gc.data.length;i++)refined.data[i]=outer.data[i]&&(gc.data[i]===cv.GC_FGD||gc.data[i]===cv.GC_PR_FGD)?255:0;

      // Keep one physical carrier component, but do not fill its internal
      // background islands. Connected-components chooses the carrier while
      // enclosed zero pixels stay zero, so arbitrary apertures can survive.
      const labels=own(new cv.Mat()),stats=own(new cv.Mat()),centroids=own(new cv.Mat()),count=cv.connectedComponentsWithStats(refined,labels,stats,centroids,8,cv.CV_32S);
      let largestLabel=0,largestArea=0;for(let label=1;label<count;label++){const a=stats.data32S[label*5+4];if(a>largestArea){largestArea=a;largestLabel=label;}}
      if(largestLabel&&largestArea>=outerArea*.62){for(let i=0;i<labels.data32S.length;i++)refined.data[i]=labels.data32S[i]===largestLabel?255:0;}else outer.copyTo(refined);
    }

    const local=own(refined.roi(new cv.Rect(ox,oy,bw,bh))),packed=own(new cv.Mat());local.copyTo(packed);
    result.push({...candidate,x:x/w,y:y/h,w:bw/w,h:bh/h,pixels:cv.countNonZero(local),
      mask:{...m,width:bw,height:bh,alpha:new Uint8Array(packed.data),topologyPreserved:true}});
  }
  return result;
}

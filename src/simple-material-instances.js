// Instance-first material discovery.
//
// Responsibility: decide HOW MANY physical materials are present and provide a
// conservative rough mask for each one. It deliberately does not attempt exact
// edge recovery. Boundary refinement is a separate per-instance stage.
//
// Pipeline:
// foreground mask -> light physical closing -> connected components
// -> absorb tiny internal fragments -> reject only small page-edge artifacts.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const boxContainsCenter=(outer,inner,margin=0)=>{
  const x=inner.x+inner.w/2,y=inner.y+inner.h/2;
  return x>=outer.x-margin&&x<=outer.x+outer.w+margin&&y>=outer.y-margin&&y<=outer.y+outer.h+margin;
};
const contourPoints=c=>Array.from({length:c.rows},(_,i)=>[c.data32S[i*2],c.data32S[i*2+1]]);

function oddPhysical(pxPerMM,mm,min=3,max=15){
  let n=Math.max(min,Math.min(max,Math.round(pxPerMM*mm)));
  if(!(n&1))n++;
  return n;
}

function componentMetrics(stats,label,w,h,paperWidthMM,paperHeightMM,pxPerMM,evidence,seeds){
  const base=label*5,x=stats.data32S[base],y=stats.data32S[base+1],
    bw=stats.data32S[base+2],bh=stats.data32S[base+3],pixels=stats.data32S[base+4],
    widthMM=bw/w*paperWidthMM,heightMM=bh/h*paperHeightMM,
    safeBand=Math.max(2,Math.round(pxPerMM*3)),
    touchesProtected=x<safeBand||y<safeBand||x+bw>w-safeBand||y+bh>h-safeBand;
  let evidenceN=0,seedN=0;
  return {label,x,y,w:bw,h:bh,pixels,widthMM,heightMM,touchesProtected,evidenceN,seedN};
}

export function discoverMaterialInstancesSimple(cv,p,own){
  const w=p.width,h=p.height,paperWidthMM=p.paperWidthMM||210,paperHeightMM=p.paperHeightMM||297,
    smallestMM=p.smallestMM||6,pxPerMM=Math.max(.5,((w/paperWidthMM)+(h/paperHeightMM))/2),
    src=own(cv.matFromArray(h,w,cv.CV_8UC1,Uint8Array.from(p.mask||new Uint8Array(w*h),v=>v?255:0))),
    closed=own(new cv.Mat()),closeSize=oddPhysical(pxPerMM,.30),kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(closeSize,closeSize)));
  cv.morphologyEx(src,closed,cv.MORPH_CLOSE,kernel);

  const labels=own(new cv.Mat()),stats=own(new cv.Mat()),centroids=own(new cv.Mat()),
    count=cv.connectedComponentsWithStats(closed,labels,stats,centroids,8,cv.CV_32S),
    raw=[],minPixels=Math.max(12,Math.round(pxPerMM*pxPerMM*smallestMM*smallestMM*.05));

  for(let label=1;label<count;label++){
    const item=componentMetrics(stats,label,w,h,paperWidthMM,paperHeightMM,pxPerMM,p.evidence,p.foregroundSeeds);
    if(item.pixels<minPixels)continue;
    if(Math.min(item.widthMM,item.heightMM)<smallestMM)continue;
    if(item.w>w*.96||item.h>h*.96)continue;
    raw.push(item);
  }

  // Compute evidence only for the already-small component set, not for every
  // possible contour. The labels image lets us scan the page once.
  const byLabel=new Map(raw.map(item=>[item.label,item]));
  for(let i=0;i<w*h;i++){
    const item=byLabel.get(labels.data32S[i]);if(!item)continue;
    if(p.evidence?.[i])item.evidenceN++;
    if(p.foregroundSeeds?.[i])item.seedN++;
  }
  for(const item of raw){
    item.evidenceDensity=item.evidenceN/Math.max(1,item.pixels);
    item.seedDensity=item.seedN/Math.max(1,item.pixels);
    item.fillRatio=item.pixels/Math.max(1,item.w*item.h);
  }

  // Reject only SMALL artifacts that enter the protected rectification band.
  // A real material may legitimately reach a page side, so page contact alone
  // is never a deletion condition.
  const pageArea=w*h;
  let candidates=raw.filter(item=>{
    if(!item.touchesProtected)return true;
    const shortMM=Math.min(item.widthMM,item.heightMM),longFraction=Math.max(item.w/w,item.h/h),
      smallAtFrame=item.pixels<pageArea*.004
        ||shortMM<Math.max(10,smallestMM*1.6),
      // Perspective rectification often leaves a long, shallow strip exactly
      // along one page side. A real material may touch the page border, so
      // contact alone is never enough; only a long-and-thin physical strip is
      // rejected here.
      longThinFrameStrip=longFraction>.42&&shortMM<15;
    return !(smallAtFrame||longThinFrameStrip);
  });

  // Absorb tiny disconnected print/detail islands whose centers lie inside a
  // much larger physical instance bbox. This changes neither the outer count
  // nor the parent's bbox; it only preserves useful rough foreground seeds.
  candidates.sort((a,b)=>b.pixels-a.pixels);
  const suppressed=new Set(),fragments=new Map();
  for(let i=0;i<candidates.length;i++){
    const parent=candidates[i];if(suppressed.has(parent.label))continue;
    for(let j=i+1;j<candidates.length;j++){
      const child=candidates[j];if(suppressed.has(child.label))continue;
      const ratio=child.pixels/Math.max(1,parent.pixels);
      if(ratio<=.15&&boxContainsCenter(parent,child,Math.round(pxPerMM*1.0))){
        suppressed.add(child.label);
        if(!fragments.has(parent.label))fragments.set(parent.label,[]);
        fragments.get(parent.label).push(child.label);
      }
    }
  }
  candidates=candidates.filter(item=>!suppressed.has(item.label));

  const out=[];
  for(const item of candidates){
    const labelsFor=new Set([item.label,...(fragments.get(item.label)||[])]),
      alpha=cv.Mat.zeros(item.h,item.w,cv.CV_8UC1);
    for(let yy=0;yy<item.h;yy++)for(let xx=0;xx<item.w;xx++){
      const global=(item.y+yy)*w+item.x+xx;
      if(labelsFor.has(labels.data32S[global]))alpha.data[yy*item.w+xx]=255;
    }
    const contours=new cv.MatVector(),hierarchy=new cv.Mat();cv.findContours(alpha,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
    let largest=null,largestArea=0;
    for(let i=0;i<contours.size();i++){const c=contours.get(i),a=Math.abs(cv.contourArea(c));if(a>largestArea){largest?.delete?.();largest=c;largestArea=a;}else c.delete();}
    const poly=largest?contourPoints(largest):[];
    largest?.delete?.();contours.delete();hierarchy.delete();
    out.push({
      x:item.x/w,y:item.y/h,w:item.w/w,h:item.h/h,pixels:item.pixels,
      edgeMethod:'instance-connected-component',instanceMethod:'connected-component',
      recognitionConfidence:clamp(.48+Math.min(item.evidenceDensity,.35)*.55+Math.min(item.fillRatio,.85)*.18-(item.touchesProtected?.05:0),0,1),
      evidenceDensity:item.evidenceDensity,seedDensity:item.seedDensity,fillRatio:item.fillRatio,
      touchesProtectedFrame:item.touchesProtected,absorbedFragments:(fragments.get(item.label)||[]).length,
      mask:{width:item.w,height:item.h,alpha:new Uint8Array(alpha.data),polygons:[poly],topologyPreserved:true}
    });
    alpha.delete();
  }
  return out.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
}

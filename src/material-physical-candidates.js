// Dimensionless geometry shared by the OpenCV detector and its regression
// tests. Inputs are normalized [0,1] rectangles: NEVER clamp their area to 1.
export const boxArea=b=>Math.max(0,b.w)*Math.max(0,b.h);
export function intersectionArea(a,b){
  const w=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
  const h=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  return w*h;
}
export const boxIoU=(a,b)=>{
  const inter=intersectionArea(a,b);
  return inter/Math.max(1e-12,boxArea(a)+boxArea(b)-inter);
};
export const overlapOfSmaller=(a,b)=>intersectionArea(a,b)/Math.max(1e-12,Math.min(boxArea(a),boxArea(b)));
export const overlapOf=(a,b)=>intersectionArea(a,b)/Math.max(1e-12,boxArea(a));
export const containsCenter=(a,b,pad=0)=>{
  const x=b.x+b.w/2,y=b.y+b.h/2;
  return x>=a.x-pad&&x<=a.x+a.w+pad&&y>=a.y-pad&&y<=a.y+a.h+pad;
};
export function separateSupportedCarriers(candidates){
  // A large colour hull can bridge two real, touching papers. Retain two
  // independently observed exteriors when their separate areas explain most
  // of that hull; printed details inside one intact sheet lack this coverage.
  return candidates.filter(parent=>{
    const area=boxArea(parent),prior=parent.boundaryPrior??0;
    if(area<=0)return false;
    const children=candidates.filter(child=>child!==parent&&
      child.physicalBoundary?.length>=3&&boxArea(child)>area*.19&&
      boxArea(child)<area*.78&&overlapOfSmaller(parent,child)>.80&&
      (child.boundaryPrior??0)>=Math.max(.42,prior-.06));
    for(let i=0;i<children.length;i++)for(let j=i+1;j<children.length;j++){
      const a=children[i],b=children[j];
      if(boxIoU(a,b)>.24||overlapOfSmaller(a,b)>.36)continue;
      if(boxArea(a)+boxArea(b)<area*.72)continue;
      if(Math.max(a.boundaryPrior??0,b.boundaryPrior??0)<prior+.12)continue;
      return false;
    }
    return true;
  });
}
export function samePhysicalCandidate(a,b){
  const iou=boxIoU(a,b),overlap=overlapOfSmaller(a,b);
  // Same frame over multiple thresholds, possibly slightly different padding.
  return iou>.60||overlap>.80;
}
const rank=c=>{
  const prior=Number.isFinite(c.boundaryPrior)?c.boundaryPrior:0;
  return (c.boundarySource==='edge-closed'?1.12:1)*
    boxArea(c)*(.8+.2*Math.max(0,Math.min(1,prior)));
};
export function dedupePhysicalCandidates(candidates,limit=48){
  // Largest physical envelope first makes interior text/printed star contours
  // subordinate to their actual paper. This intentionally does NOT merge
  // independent adjacent objects on proximity alone.
  const ranked=[...candidates].filter(x=>x&&boxArea(x)>0).sort((a,b)=>rank(b)-rank(a));
  const selected=[];
  for(const item of ranked){
    if(selected.some(prev=>samePhysicalCandidate(prev,item)))continue;
    selected.push(item);
    if(selected.length>=limit)break;
  }
  return selected.sort((a,b)=>a.y-b.y||a.x-b.x);
}
export function mergeAlignedCarrierPieces(candidates,pageHeight=636,yOverlapLimit=.30){
  const chosen=[...candidates];let changed=true;
  while(changed){
    changed=false;
    for(let i=0;i<chosen.length&&!changed;i++)for(let j=i+1;j<chosen.length;j++){
      const a=chosen[i],b=chosen[j];
      if(!a.physicalBoundary||!b.physicalBoundary)continue;
      if(a.boundarySource===b.boundarySource)continue;
      const xov=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))/Math.max(1e-9,Math.min(a.w,b.w));
      const center=Math.abs((a.x+a.w/2)-(b.x+b.w/2))/Math.max(a.w,b.w);
      const yov=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y))/Math.max(1e-9,Math.min(a.h,b.h));
      const gap=Math.max(0,Math.max(a.y,b.y)-Math.min(a.y+a.h,b.y+b.h));
      const aligned=xov>.86&&center<.13&&yov<yOverlapLimit&&gap<12/Math.max(1,pageHeight);
      if(!aligned)continue;
      const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),right=Math.max(a.x+a.w,b.x+b.w),bottom=Math.max(a.y+a.h,b.y+b.h);
      // The joined rectangle is only an inferred proposal. Explicitly mark
      // uncertainty, never claim its connecting span has a measured contour.
      chosen[i]={...a,x,y,w:right-x,h:bottom-y,physicalBoundary:[
        [x,y],[right,y],[right,bottom],[x,bottom]],
        boundarySource:'aligned-joint',boundaryPrior:Math.min(a.boundaryPrior??0,b.boundaryPrior??0),
        needsBoundaryReview:true};
      chosen.splice(j,1);changed=true;break;
    }
  }
  return chosen;
}

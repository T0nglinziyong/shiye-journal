// Instance discovery and boundary refinement are separate responsibilities.
// Watershed instances prove that a physical item exists. Closed contours may
// only refine/merge those instances, except for a strict high-paper-contact
// missing-instance recovery (needed for pale photos/cards whose interior leaks
// into page background).

const area=r=>Math.max(0,r.w)*Math.max(0,r.h);
const intersection=(a,b)=>{
  const l=Math.max(a.x,b.x),t=Math.max(a.y,b.y),r=Math.min(a.x+a.w,b.x+b.w),d=Math.min(a.y+a.h,b.y+b.h);
  return Math.max(0,r-l)*Math.max(0,d-t);
};
const overlapOf=(a,b)=>intersection(a,b)/Math.max(1e-9,area(a));
const containsCenter=(outer,inner)=>{
  const x=inner.x+inner.w/2,y=inner.y+inner.h/2;
  return x>=outer.x&&x<=outer.x+outer.w&&y>=outer.y&&y<=outer.y+outer.h;
};
const contained=(a,b)=>a.x>=b.x&&a.y>=b.y&&a.x+a.w<=b.x+b.w&&a.y+a.h<=b.y+b.h;
const effectivelyContained=(child,parent)=>{
  if(contained(child,parent))return true;
  if(area(child)>=area(parent)*.20||overlapOf(child,parent)<=.65)return false;
  const x=child.x+child.w/2,y=child.y+child.h/2,margin=.006;
  return x>=parent.x-margin&&x<=parent.x+parent.w+margin&&y>=parent.y-margin&&y<=parent.y+parent.h+margin;
};
const strongPhysicalBoundary=s=>(s.paperContactRatio??0)>=.80&&(s.interiorBackgroundRatio??1)<=.10&&(s.insideEvidenceRatio??1)<=.75;
const strongReconstruction=s=>s.boundaryReconstruction===true
  &&(s.reconstructionScore??0)>=.28
  &&(s.edgeSupportRatio??0)>=.42
  &&(s.paperContactRatio??0)>=.48
  &&((s.interiorBackgroundRatio??1)<=.42||(s.fillRatio??0)>=.64||(s.edgeSupportRatio??0)>=.62);

export function fuseRecognitionCandidates(instances,structuralCandidates){
  const base=instances.map(candidate=>({candidate,used:false})),accepted=[];
  const structures=[...structuralCandidates]
    .filter(s=>(s.paperContactRatio??0)>=(s.boundaryReconstruction===true?.48:.70))
    .sort((a,b)=>area(b)-area(a));

  for(const structural of structures){
    const matches=base
      .map((entry,index)=>({entry,index}))
      .filter(({entry})=>!entry.used&&(containsCenter(structural,entry.candidate)||overlapOf(entry.candidate,structural)>.20));
    let accept=false;
    if(matches.length){
      // Identity is decided by physical support, not by a shape class.
      // If a closed boundary has page outside and almost no page-connected
      // pixels inside, several watershed islands are likely prints/details on
      // one carrier. An accidental contour around neighbouring loose items
      // usually contains page-connected gaps and therefore fails this test.
      const shares=matches.map(({entry})=>area(entry.candidate)/Math.max(area(structural),1e-9)).sort((a,b)=>b-a);
      const occupancy=matches.reduce((sum,{entry})=>sum+intersection(entry.candidate,structural),0)/Math.max(area(structural),1e-9);
      accept=matches.length===1||shares[1]<.15
        ||(strongPhysicalBoundary(structural)&&occupancy<=.84)
        ||(strongReconstruction(structural)&&(occupancy<=.72||(structural.matchedPairOverlap??0)>=.18));
      accept&&=(structural.paperContactRatio??0)>=.48;
    }else{
      // Missing-instance recovery is deliberately strict. It recovers a pale
      // photo/card with a real paper-facing perimeter, but internal printed
      // boxes/squares have almost no direct page-background contact.
      accept=(structural.paperContactRatio??0)>=.90
        &&(structural.insideEvidenceRatio??0)>=.20
        &&(structural.fillRatio??0)>=.45
        &&area(structural)>=.006;
    }
    if(!accept)continue;
    accepted.push(structural);
    for(const {entry} of matches)entry.used=true;
  }

  for(const entry of base)if(!entry.used)accepted.push(entry.candidate);

  // Keep the outer accepted physical item, never its internal print detail.
  // A tiny numerical overshoot from GrabCut/watershed should not let an
  // internal glyph survive beside an otherwise enclosing physical boundary.
  const ordered=accepted.sort((a,b)=>area(b)-area(a)),kept=[];
  for(const candidate of ordered)if(!kept.some(parent=>effectivelyContained(candidate,parent)))kept.push(candidate);
  return kept;
}

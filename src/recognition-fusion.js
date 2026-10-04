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

export function fuseRecognitionCandidates(instances,structuralCandidates){
  const base=instances.map(candidate=>({candidate,used:false})),accepted=[];
  const structures=[...structuralCandidates]
    .filter(s=>(s.paperContactRatio??0)>=.70)
    .sort((a,b)=>area(b)-area(a));

  for(const structural of structures){
    const matches=base
      .map((entry,index)=>({entry,index}))
      .filter(({entry})=>!entry.used&&(containsCenter(structural,entry.candidate)||overlapOf(entry.candidate,structural)>.20));
    let accept=false;
    if(matches.length){
      // One physical sticker may contain several watershed islands (printed
      // figures on white stock). But never merge two substantial neighbouring
      // items merely because an edge contour happened to surround both.
      const shares=matches.map(({entry})=>area(entry.candidate)/Math.max(area(structural),1e-9)).sort((a,b)=>b-a);
      accept=matches.length===1||shares[1]<.15;
      accept&&=(structural.paperContactRatio??0)>=.70;
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
  const ordered=accepted.sort((a,b)=>area(b)-area(a)),kept=[];
  for(const candidate of ordered)if(!kept.some(parent=>contained(candidate,parent)))kept.push(candidate);
  return kept;
}

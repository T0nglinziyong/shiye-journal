// One-to-one physical boundary hints for the instance-first recognizer.
//
// Identity is authoritative and comes from simple connected components.
// Structural enclosures are allowed to improve ONE instance's rough boundary,
// but they are never allowed to create, delete, split, or merge identities.

const area=r=>Math.max(0,r?.w||0)*Math.max(0,r?.h||0);
const intersection=(a,b)=>{
  const l=Math.max(a.x,b.x),t=Math.max(a.y,b.y),r=Math.min(a.x+a.w,b.x+b.w),d=Math.min(a.y+a.h,b.y+b.h);
  return Math.max(0,r-l)*Math.max(0,d-t);
};
const overlapOf=(a,b)=>intersection(a,b)/Math.max(1e-9,area(a));
const containsCenter=(outer,inner)=>{
  const x=inner.x+inner.w/2,y=inner.y+inner.h/2;
  return x>=outer.x&&x<=outer.x+outer.w&&y>=outer.y&&y<=outer.y+outer.h;
};

export function selectBoundaryHint(instance,instances,enclosures,index=-1){
  const candidates=[];
  for(const structural of enclosures||[]){
    const identityOverlap=overlapOf(instance,structural);
    if(identityOverlap<.20&&!containsCenter(structural,instance))continue;

    // The structural boundary belongs to at most one identity. Any meaningful
    // overlap with a different instance makes it unsafe as a boundary hint.
    let otherOverlap=0;
    for(let i=0;i<(instances||[]).length;i++){
      const other=instances[i];if(other===instance||i===index)continue;
      otherOverlap=Math.max(otherOverlap,overlapOf(other,structural));
    }
    if(otherOverlap>.20)continue;

    const paperContact=structural.paperContactRatio??0,
      interiorBackground=structural.interiorBackgroundRatio??1,
      fill=structural.fillRatio??0,
      rectFill=structural.rectFill??0,
      confidence=structural.structuralConfidence??0,
      areaRatio=area(structural)/Math.max(1e-9,area(instance));

    const identityFill=instance.identityFillRatio??instance.fillRatio??0,
      fillGain=fill-identityFill;
    // Boundary hints are completion-only. The rough connected component owns
    // identity; a structural contour may replace it only when it clearly adds
    // missing carrier area without enclosing appreciable page background.
    // This deliberately forbids "prettier but smaller" enclosure swaps.
    if(paperContact<.75||fill<.60)continue;
    if(interiorBackground>.25)continue;
    if(areaRatio<1.03||areaRatio>1.80)continue;
    if(fillGain<.06)continue;

    const score=paperContact*.30+confidence*.20+fill*.15+rectFill*.15
      +Math.min(identityOverlap,1)*.10
      -interiorBackground*.20
      -Math.abs(Math.log(Math.max(areaRatio,1e-6)))*.08;
    candidates.push({candidate:structural,score,identityOverlap,otherOverlap,areaRatio});
  }
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0]||null;
}

export function attachBoundaryHints(instances,enclosures){
  return (instances||[]).map((instance,index)=>{
    const best=selectBoundaryHint(instance,instances,enclosures,index);
    if(!best)return {...instance,boundaryHint:null};
    const structural=best.candidate;
    // Structural geometry/mask replaces only the rough boundary. Identity
    // metadata and observed content remain attached to the original instance.
    return {
      ...instance,
      ...structural,
      identitySource:instance.instanceMethod||instance.identitySource||'connected-component',
      identityX:instance.x,identityY:instance.y,identityW:instance.w,identityH:instance.h,
      identityPixels:instance.pixels,
      identityFillRatio:instance.identityFillRatio??instance.fillRatio,
      identityRecognitionConfidence:instance.recognitionConfidence,
      touchesProtectedFrame:instance.touchesProtectedFrame,
      absorbedFragments:instance.absorbedFragments,
      contentMask:instance.contentMask,
      boundaryHint:'edge-enclosure',
      boundaryHintScore:best.score,
      boundaryHintIdentityOverlap:best.identityOverlap,
      boundaryHintAreaRatio:best.areaRatio
    };
  });
}

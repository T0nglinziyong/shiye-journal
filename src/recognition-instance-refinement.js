// Decide whether one authoritative rough identity needs local boundary work.
// This module never changes material count; it only chooses one local refiner.

export function instanceRefinementPlan(candidate){
  const fill=candidate?.identityFillRatio??candidate?.fillRatio??0,
    seedDensity=candidate?.seedDensity??0,
    touchesFrame=candidate?.touchesProtectedFrame===true;

  // Very low fill means visible content occupies only a small fraction of the
  // rough physical bbox: use a slightly larger local ROI to recover a pale
  // carrier (e.g. white die-cut sticker).
  if(fill<.45)return {kind:'grabcut',padMM:15,reason:'low-fill-carrier'};

  // A moderate-fill interior identity with substantial strong visual content
  // is the common "printed content + pale surrounding carrier" case. A small
  // local GrabCut is cheaper and safer than a full-page enclosure search.
  if(!touchesFrame&&fill>=.65&&fill<=.85&&seedDensity>=.20){
    return {kind:'grabcut',padMM:10,reason:'moderate-fill-carrier'};
  }

  // A substantial identity that reaches the protected rectification band may
  // have lost part of its edge to page-frame cleanup. Complete only that one.
  if(touchesFrame&&fill>=.70){
    return {kind:'complete',reason:'frame-high-fill'};
  }

  return null;
}

// This presentation-level rule is applied ONLY to automatically discovered
// candidates. It does not alter the c9 discovery, CV segmentation, A4
// correction, masking, manual frames or high-resolution extraction pipeline.
export const MIN_AUTOMATIC_SIDE_MM=9;

// The automatic editor displays orientedBox when available. These normalized
// dimensions are fractions of the corrected paper's physical width / height.
// Use the unrounded values: exactly 9 mm must remain a valid candidate.
export function filterAutomaticMaterialBoxes(regions,{paperWidthMM,paperHeightMM,enabled=true}={}){
  if(!Array.isArray(regions))return [];
  // Without a physical paper reference, there is no defensible mm cutoff.
  if(!enabled||!Number.isFinite(paperWidthMM)||!Number.isFinite(paperHeightMM)||
     paperWidthMM<=0||paperHeightMM<=0)return regions;
  return regions.filter(region=>{
    const oriented=region?.orientedBox;
    const widthRatio=Number.isFinite(oriented?.width)?oriented.width:region?.w;
    const heightRatio=Number.isFinite(oriented?.height)?oriented.height:region?.h;
    const widthMM=widthRatio*paperWidthMM,heightMM=heightRatio*paperHeightMM;
    // Preserve indeterminate candidates for review rather than silently
    // hiding an unrelated detection/geometry failure.
    if(!Number.isFinite(widthMM)||!Number.isFinite(heightMM))return true;
    return widthMM>=MIN_AUTOMATIC_SIDE_MM&&heightMM>=MIN_AUTOMATIC_SIDE_MM;
  });
}

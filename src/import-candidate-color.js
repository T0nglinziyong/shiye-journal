// Keep the editable candidate's RGB source in the SAME colour space as the
// accepted cutout. Recognition geometry and masks are not changed here.
// The full frame MUST be unmasked: otherwise hand-restoring a removed pixel
// reveals either a transparent pixel or the uncorrected photograph.
export async function extractEditableCandidateRGB(source,paper,region,{lighting=null,crop}={}){
  if(typeof crop!=='function')throw Error('缺少素材裁图处理器');
  const cutout=await crop(source,paper,region,{lighting});
  // No matte was removed, so the colour source is already the full region.
  // Avoid a second full-resolution decode/PNG if there is no mask.
  const fullColor=region.mask
    ?await crop(source,paper,{...region,mask:null},{lighting})
    :cutout;
  return {cutout,fullColor};
}

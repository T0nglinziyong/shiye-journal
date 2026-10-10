// An unconfirmed UI placeholder rectangle is not a detected A4 frame.
// Keep review sticky across queue switches and background prefetch until
// the user explicitly applies a rectification preview.
export function requiresManualPaperConfirmation({
  paperSize='a4',correctedBitmap=null,appliedCorners=null,
  reviewFlag=false,corners=null
}={}){
  return paperSize!=='none'&&!correctedBitmap&&!appliedCorners&&
    (Boolean(reviewFlag)||!corners);
}

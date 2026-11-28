export function resetPaperCorrection(state){
  const correctedBitmap=state.correctedBitmap,correctedURL=state.correctedURL;
  correctedBitmap?.close?.();state.correctedBitmap=null;
  if(correctedURL)URL.revokeObjectURL(correctedURL);
  state.correctedURL=null;state.paperCorners=null;
  if(state.paperPreviewBitmap!==correctedBitmap)state.paperPreviewBitmap?.close?.();state.paperPreviewBitmap=null;
  if(state.paperPreviewURL&&state.paperPreviewURL!==correctedURL)URL.revokeObjectURL(state.paperPreviewURL);
  state.paperPreviewURL=null;state.showCorrectionPreview=false;state.paperPreviewApplied=false;
}

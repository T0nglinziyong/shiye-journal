export function resetPaperCorrection(state){
  state.correctedBitmap?.close?.();state.correctedBitmap=null;
  if(state.correctedURL)URL.revokeObjectURL(state.correctedURL);
  state.correctedURL=null;state.paperCorners=null;
  state.paperPreviewBitmap?.close?.();state.paperPreviewBitmap=null;
  if(state.paperPreviewURL)URL.revokeObjectURL(state.paperPreviewURL);
  state.paperPreviewURL=null;state.showCorrectionPreview=false;state.paperPreviewApplied=false;
}

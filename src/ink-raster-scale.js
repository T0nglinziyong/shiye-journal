// High-DPI *transient* ink canvas. Scene geometry and saved points stay in
// logical units; only the live raster scales with DPR and actual zoom.
export function inkBackingSize({logicalWidth,logicalHeight,cssWidth,cssHeight,pixelRatio=1,maxPixels=9_000_000,maxScale=3}){
  if(![logicalWidth,logicalHeight].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid ink scene bounds');
  const width=Math.max(1,Number(cssWidth)||logicalWidth),height=Math.max(1,Number(cssHeight)||logicalHeight);
  const ratio=Math.min(Math.max(1,Number(pixelRatio)||1),3);
  const desired=Math.max(1,Math.min(maxScale,Math.max(width/logicalWidth,height/logicalHeight)*ratio));
  const budget=Math.sqrt(maxPixels/(logicalWidth*logicalHeight));
  const scale=Math.max(.25,Math.min(desired,budget));
  return {width:Math.max(1,Math.round(logicalWidth*scale)),
    height:Math.max(1,Math.round(logicalHeight*scale)),scale};
}
export function configureInkBacking(canvas,logicalWidth,logicalHeight,{pixelRatio=globalThis.devicePixelRatio||1}={}){
  const rect=canvas.getBoundingClientRect?.()||{};
  const next=inkBackingSize({logicalWidth,logicalHeight,
    cssWidth:rect.width||canvas.clientWidth,cssHeight:rect.height||canvas.clientHeight,pixelRatio});
  // Panzoom fires many events per pinch. Exact-per-pixel reallocations would
  // discard the transient raster every frame. Use hysteresis: enlarge only
  // when the current backing is noticeably undersampled, and shrink only
  // after a substantial reduction in displayed size.
  const established=canvas.width>0&&canvas.height>0;
  const closeEnough=established&&canvas.width>=next.width*.8&&
    canvas.height>=next.height*.8&&canvas.width<=next.width*1.7&&
    canvas.height<=next.height*1.7;
  const changed=!closeEnough;
  if(changed){canvas.width=next.width;canvas.height=next.height;}
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Ink 2D context unavailable');
  ctx.setTransform(canvas.width/logicalWidth,0,0,canvas.height/logicalHeight,0,0);
  ctx.imageSmoothingEnabled=true;
  return {...next,changed,ctx};
}

// Only one RGBA copy is needed when segmentation and source use the same
// fixed analysis raster. Separate source bytes are retained when optional
// preprocessing produced a genuinely different segmentation raster.
export function workerRasterPair(frame,sourceFrame=frame){
  const pixels=new Uint8ClampedArray(frame.data);
  return {pixels,sourcePixels:sourceFrame.data===frame.data
    ?pixels:new Uint8ClampedArray(sourceFrame.data)};
}

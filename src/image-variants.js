export const MIN_DISPLAY_EDGE=360;
export const MAX_DISPLAY_EDGE=4096;

export function imagePixelSize(cssPixels=0,pixelRatio=1){
  const css=Number(cssPixels),ratio=Number(pixelRatio);
  if(!Number.isFinite(css)||css<=0)return MIN_DISPLAY_EDGE;
  const boundedRatio=Number.isFinite(ratio)?Math.max(0.5,Math.min(4,ratio)):1;
  return Math.max(MIN_DISPLAY_EDGE,Math.min(MAX_DISPLAY_EDGE,Math.ceil(css*boundedRatio)));
}

export function imageVariant(pixels){
  return `preview${imagePixelSize(pixels)}`;
}

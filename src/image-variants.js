export const COVER_EDGE=720;
export const MIN_DISPLAY_EDGE=COVER_EDGE;
export const MAX_DISPLAY_EDGE=4096;

export function imagePixelSize(cssPixels=0,pixelRatio=1,screenWidth=1440,screenHeight=900){
  const css=Number(cssPixels),ratio=Number(pixelRatio),width=Number(screenWidth),height=Number(screenHeight);
  if(!Number.isFinite(css)||css<=0)return MIN_DISPLAY_EDGE;
  const boundedRatio=Number.isFinite(ratio)?Math.max(0.5,Math.min(4,ratio)):1;
  const area=width>0&&height>0&&Number.isFinite(width*height)?width*height:1440*900;
  const screenFactor=Math.max(0.75,Math.min(2,Math.sqrt(area/(1440*900))));
  return Math.max(MIN_DISPLAY_EDGE,Math.min(MAX_DISPLAY_EDGE,Math.ceil(css*boundedRatio*screenFactor)));
}

export function imageVariant(pixels){
  return `preview${imagePixelSize(pixels)}`;
}

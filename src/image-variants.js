// Fixed catalogue/project thumbnails use 480px on the longest edge.
// Dynamic canvas/detail sizes retain finer 256/360 steps when they are
// genuinely sufficient. Every network request uses a stable discrete tier.
export const COVER_EDGE=480;
export const DISPLAY_TIERS=Object.freeze([256,360,480,600,720,960,1200,1440]);
export const MIN_DISPLAY_EDGE=DISPLAY_TIERS[0];
export const MAX_DISPLAY_EDGE=DISPLAY_TIERS[DISPLAY_TIERS.length-1];
export const DISPLAY_SCALE=2/3;

export function imageTier(pixels=COVER_EDGE){
 const raw=Number(pixels);
 if(!Number.isFinite(raw)||raw<=0)return COVER_EDGE;
 return DISPLAY_TIERS.find(edge=>edge>=raw)||MAX_DISPLAY_EDGE;
}

export function imagePixelSize(cssPixels=0,pixelRatio=1,screenWidth=1440,screenHeight=900){
 const css=Number(cssPixels),ratio=Number(pixelRatio),width=Number(screenWidth),height=Number(screenHeight);
 if(!Number.isFinite(css)||css<=0)return COVER_EDGE;
 const boundedRatio=Number.isFinite(ratio)?Math.max(.5,Math.min(4,ratio)):1;
 const area=width>0&&height>0&&Number.isFinite(width*height)?width*height:1440*900;
 const screenFactor=Math.max(.75,Math.min(2,Math.sqrt(area/(1440*900))));
 return imageTier(Math.ceil(css*boundedRatio*screenFactor*DISPLAY_SCALE));
}
export function imageVariant(pixels=COVER_EDGE){
 return 'preview'+imageTier(pixels);
}
export function cachedTierChoice(available=[],requested=COVER_EDGE){
 const tier=imageTier(requested);
 const values=[...new Set(available.filter(value=>Number.isFinite(value)&&DISPLAY_TIERS.includes(value)))].sort((a,b)=>a-b);
 const sufficient=values.find(value=>value>=tier);
 return {target:tier,sufficient:sufficient??null,temporary:sufficient?null:values.at(-1)??null};
}

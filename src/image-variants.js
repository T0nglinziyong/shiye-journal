export const IMAGE_TIERS=[360,720,1440,2160];
export function imageTier(cssPixels=0,pixelRatio=1){
  const requested=Math.max(1,Number(cssPixels)||0)*Math.min(3,Math.max(1,Number(pixelRatio)||1))*1.12;
  return IMAGE_TIERS.find(size=>size>=requested)||IMAGE_TIERS.at(-1);
}
export function imageVariant(size){
  const tier=IMAGE_TIERS.find(value=>value>=Number(size))||IMAGE_TIERS.at(-1);
  return `preview${tier}`;
}

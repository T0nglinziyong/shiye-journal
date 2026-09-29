export function containBox(width,height,availableWidth,availableHeight,padding=24){
  const scale=Math.max(0,Math.min(Math.max(0,availableWidth-padding)/width,Math.max(0,availableHeight-padding)/height));
  return {width:width*scale,height:height*scale,left:(availableWidth-width*scale)/2,top:(availableHeight-height*scale)/2};
}

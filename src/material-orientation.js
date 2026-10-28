// Calculate display geometry from the final visible contour, never from the
// discovery box used to initialize segmentation.
export function orientedContourBox(cv,contour,offsetX,offsetY,pageW,pageH,area,shapeModel=null){
  const rect=cv.minAreaRect(contour);
  const rotation=((rect.angle+45)%90+90)%90-45;
  const angle=Math.abs(rotation)<.8?0:rotation;
  const swap=Math.abs(angle-rect.angle)>45;
  const rectangularity=Math.min(1,area/Math.max(1,rect.size.width*rect.size.height));
  return {
    centerX:(offsetX+rect.center.x)/pageW,centerY:(offsetY+rect.center.y)/pageH,
    width:(swap?rect.size.height:rect.size.width)/pageW,
    height:(swap?rect.size.width:rect.size.height)/pageH,
    rotation:angle,rectangularity,
    autoDeskew:shapeModel==='quadrilateral'||rectangularity>=.77,
    source:'final-mask'
  };
}

// Candidate rectangles are normalized to the selected paper, while the image
// preview is object-fit:contain inside a responsive panel. Keep one affine map
// for the overlay and the full-resolution extraction path.
export function paperOverlayRect(containerWidth,containerHeight,imageWidth,imageHeight,paper){
  const scale=Math.min(containerWidth/imageWidth,containerHeight/imageHeight);
  const imageLeft=(containerWidth-imageWidth*scale)/2;
  const imageTop=(containerHeight-imageHeight*scale)/2;
  return {left:imageLeft+paper.x*imageWidth*scale,top:imageTop+paper.y*imageHeight*scale,width:paper.w*imageWidth*scale,height:paper.h*imageHeight*scale};
}

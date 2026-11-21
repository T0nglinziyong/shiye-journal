// Match the floating strip's 44px targets, 2px gaps and 3px outer edges.
export function editorActionPosition({x,y,width,height,toolbarBottom=0,group=false}){
 const count=group?5:4,halfWidth=(count*44+(count-1)*2+6)/2,halfHeight=25,margin=8;
 const leftMin=halfWidth+margin,leftMax=width-halfWidth-margin;
 const topMin=Math.max(0,toolbarBottom)+margin+halfHeight,topMax=height-margin-halfHeight;
 return {left:leftMax<leftMin?width/2:Math.max(leftMin,Math.min(leftMax,x)),
  top:Math.max(halfHeight+margin,Math.min(Math.max(topMin,y-30),topMax))};
}

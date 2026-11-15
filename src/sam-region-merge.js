// Merge already segmented pixels. A user grouping must never rerun SAM or
// replace an irregular transparent mask with a rectangular candidate box.
export function mergeSamRegions(regions,indices){
  const chosen=[...new Set(indices)].sort((a,b)=>a-b).map(index=>regions[index]);
  if(chosen.length<2||chosen.some(region=>!region?.mask?.alpha))throw Error('请至少选择两个已分割区域');
  const width=chosen[0].segmentationFrameWidth,height=chosen[0].segmentationFrameHeight;
  if(!Number.isInteger(width)||!Number.isInteger(height)||chosen.some(region=>
    region.segmentationFrameWidth!==width||region.segmentationFrameHeight!==height))
    throw Error('所选区域不在同一张分割图上');
  const boxes=chosen.map(region=>{
    const x=Math.round(region.x*width),y=Math.round(region.y*height);
    return {x,y,width:region.mask.width,height:region.mask.height,alpha:region.mask.alpha};
  });
  const x0=Math.min(...boxes.map(box=>box.x)),y0=Math.min(...boxes.map(box=>box.y));
  const x1=Math.max(...boxes.map(box=>box.x+box.width)),y1=Math.max(...boxes.map(box=>box.y+box.height));
  const outWidth=x1-x0,outHeight=y1-y0,alpha=new Uint8Array(outWidth*outHeight);
  for(const box of boxes)for(let y=0;y<box.height;y++)for(let x=0;x<box.width;x++){
    const at=(y+box.y-y0)*outWidth+x+box.x-x0;
    alpha[at]=Math.max(alpha[at],box.alpha[y*box.width+x]);
  }
  return {x:x0/width,y:y0/height,w:outWidth/width,h:outHeight/height,
    pixels:alpha.reduce((count,value)=>count+(value>0),0),
    segmentationMethod:chosen[0].segmentationMethod,segmentationFailed:false,
    segmentationFrameWidth:width,segmentationFrameHeight:height,
    mask:{width:outWidth,height:outHeight,alpha,topologyPreserved:true},
    manuallyMerged:true};
}

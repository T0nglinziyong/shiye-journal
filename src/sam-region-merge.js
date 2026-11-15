// A group is one physical paper/card, including the background between its
// printed elements. Prefer a SAM carrier proposal over a rectangular fallback.
export function mergeSamRegions(regions,indices,backgrounds=[]){
  const selected=[...new Set(indices)].sort((a,b)=>a-b),chosen=selected.map(index=>regions[index]);
  if(chosen.length<2||chosen.some(region=>!region?.mask?.alpha))throw Error('请至少选择两个已分割区域');
  const width=chosen[0].segmentationFrameWidth,height=chosen[0].segmentationFrameHeight;
  if(!Number.isInteger(width)||!Number.isInteger(height)||chosen.some(region=>
    region.segmentationFrameWidth!==width||region.segmentationFrameHeight!==height))
    throw Error('所选区域不在同一张分割图上');
  const box=region=>({x:Math.round(region.x*width),y:Math.round(region.y*height),
    width:region.mask.width,height:region.mask.height,alpha:region.mask.alpha});
  const chosenBoxes=chosen.map(box);
  const contains=(outer,inner)=>{
    const overlap=Math.max(0,Math.min(outer.x+outer.width,inner.x+inner.width)-Math.max(outer.x,inner.x))*
      Math.max(0,Math.min(outer.y+outer.height,inner.y+inner.height)-Math.max(outer.y,inner.y));
    return overlap>=inner.width*inner.height*.9;
  };
  const carrier=backgrounds.filter(item=>item?.mask?.alpha&&
    item.segmentationFrameWidth===width&&item.segmentationFrameHeight===height).map(box)
    .filter(item=>chosenBoxes.every(child=>contains(item,child)))
    .sort((a,b)=>a.width*a.height-b.width*b.height)[0]||null;
  const allBoxes=regions.map(box);
  const absorbedIndices=carrier?allBoxes.flatMap((item,index)=>contains(carrier,item)?[index]:[]):selected;
  const x0=carrier?carrier.x:Math.max(0,Math.min(...chosenBoxes.map(item=>item.x))-Math.round(width*.01));
  const y0=carrier?carrier.y:Math.max(0,Math.min(...chosenBoxes.map(item=>item.y))-Math.round(height*.01));
  const x1=carrier?carrier.x+carrier.width:Math.min(width,Math.max(...chosenBoxes.map(item=>item.x+item.width))+Math.round(width*.01));
  const y1=carrier?carrier.y+carrier.height:Math.min(height,Math.max(...chosenBoxes.map(item=>item.y+item.height))+Math.round(height*.01));
  const outWidth=x1-x0,outHeight=y1-y0,alpha=new Uint8Array(outWidth*outHeight);
  if(carrier){
    for(let y=0;y<carrier.height;y++)for(let x=0;x<carrier.width;x++)
      alpha[y*outWidth+x]=carrier.alpha[y*carrier.width+x];
    for(const index of absorbedIndices){
      const item=allBoxes[index];
      for(let y=0;y<item.height;y++)for(let x=0;x<item.width;x++){
        const tx=x+item.x-x0,ty=y+item.y-y0;
        if(tx<0||tx>=outWidth||ty<0||ty>=outHeight)continue;
        const at=ty*outWidth+tx;
        alpha[at]=Math.max(alpha[at],item.alpha[y*item.width+x]);
      }
    }
  }else alpha.fill(255);
  return {x:x0/width,y:y0/height,w:outWidth/width,h:outHeight/height,
    pixels:alpha.reduce((count,value)=>count+(value>0),0),
    segmentationMethod:chosen[0].segmentationMethod,segmentationFailed:false,
    segmentationFrameWidth:width,segmentationFrameHeight:height,
    mask:{width:outWidth,height:outHeight,alpha,topologyPreserved:true},
    absorbedIndices,mergeBasis:carrier?'sam-background':'enclosing-background',manuallyMerged:true};
}

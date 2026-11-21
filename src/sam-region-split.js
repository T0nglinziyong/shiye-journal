// Source masks are retained by reference when regions are joined. Restore
// them before requesting another model pass; never infer children from a box.
export function splitSources(region){
  const sources=region?.splitSources;
  return Array.isArray(sources)&&sources.length?sources:[];
}

export function splitBySource(region,index){
  const sources=splitSources(region);
  if(!Number.isInteger(index)||index<0||index>=sources.length)
    throw Error('此区域没有可恢复的原始子区域');
  if(sources.length>1)return sources.map(source=>intersectRegion(region,source));
  const child=intersectRegion(region,sources[index]);
  // A carrier can include bare paper between its printed objects. Keep that
  // paper as the remainder rather than silently dropping it.
  const remainder=subtractRegion(region,child);
  return [child,{...remainder,splitSources:undefined}];
}

export function subtractRegion(parent,child){
  const width=parent?.segmentationFrameWidth,height=parent?.segmentationFrameHeight;
  if(!width||!height||width!==child?.segmentationFrameWidth||height!==child?.segmentationFrameHeight)
    throw Error('两个 Mask 不在同一张分割图上');
  const pm=parent.mask,cm=child.mask;
  if(!pm?.alpha||!cm?.alpha)throw Error('分割 Mask 缺失');
  const px=Math.round(parent.x*width),py=Math.round(parent.y*height);
  const cx=Math.round(child.x*width),cy=Math.round(child.y*height);
  const alpha=new Uint8Array(pm.alpha);
  let removed=0;
  for(let y=0;y<cm.height;y++)for(let x=0;x<cm.width;x++){
    const tx=cx+x-px,ty=cy+y-py;
    if(tx<0||ty<0||tx>=pm.width||ty>=pm.height)continue;
    const at=ty*pm.width+tx;
    if(cm.alpha[y*cm.width+x]>=128&&alpha[at]){alpha[at]=0;removed++;}
  }
  if(removed<Math.max(3,parent.pixels*.005))throw Error('局部分割没有从当前对象中分出有效区域');
  const remaining=alpha.reduce((count,value)=>count+(value>=128),0);
  if(remaining<Math.max(3,parent.pixels*.005))throw Error('局部分割覆盖了整个对象，请框出更小的部分');
  return {...parent,mask:{...pm,alpha},pixels:remaining,manuallyMerged:false};
}

export function intersectRegion(parent,child){
  const width=parent?.segmentationFrameWidth,height=parent?.segmentationFrameHeight;
  if(!width||!height||width!==child?.segmentationFrameWidth||height!==child?.segmentationFrameHeight)
    throw Error('两个 Mask 不在同一张分割图上');
  const pm=parent.mask,cm=child.mask;
  if(!pm?.alpha||!cm?.alpha)throw Error('分割 Mask 缺失');
  const px=Math.round(parent.x*width),py=Math.round(parent.y*height);
  const cx=Math.round(child.x*width),cy=Math.round(child.y*height);
  const alpha=new Uint8Array(cm.width*cm.height);
  let left=cm.width,top=cm.height,right=0,bottom=0,pixels=0;
  for(let y=0;y<cm.height;y++)for(let x=0;x<cm.width;x++){
    const tx=cx+x-px,ty=cy+y-py;
    if(tx<0||ty<0||tx>=pm.width||ty>=pm.height||pm.alpha[ty*pm.width+tx]<128)continue;
    const value=cm.alpha[y*cm.width+x];
    if(value<128)continue;
    alpha[y*cm.width+x]=value;pixels++;
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
  }
  if(pixels<Math.max(3,parent.pixels*.005))throw Error('局部分割没有从当前对象中分出有效区域');
  const outWidth=right-left,outHeight=bottom-top,trimmed=new Uint8Array(outWidth*outHeight);
  for(let y=0;y<outHeight;y++)trimmed.set(alpha.subarray((y+top)*cm.width+left,
    (y+top)*cm.width+left+outWidth),y*outWidth);
  return {...child,x:(cx+left)/width,y:(cy+top)/height,w:outWidth/width,h:outHeight/height,
    pixels,mask:{...cm,width:outWidth,height:outHeight,alpha:trimmed}};
}

export function findSourceAt(sources,x,y){
  for(let index=sources.length-1;index>=0;index--){
    const region=sources[index],mask=region.mask;
    if(!mask?.alpha||x<region.x||y<region.y||x>=region.x+region.w||y>=region.y+region.h)continue;
    const mx=Math.floor((x-region.x)/region.w*mask.width);
    const my=Math.floor((y-region.y)/region.h*mask.height);
    if(mask.alpha[my*mask.width+mx]>=128)return index;
  }
  return -1;
}

export function findSourceInBox(sources,box){
  let best=-1,score=0;
  sources.forEach((region,index)=>{
    const x=Math.max(box.x,region.x),y=Math.max(box.y,region.y);
    const overlap=Math.max(0,Math.min(box.x+box.w,region.x+region.w)-x)*
      Math.max(0,Math.min(box.y+box.h,region.y+region.h)-y);
    const value=overlap/Math.max(1e-8,region.w*region.h);
    if(value>score){score=value;best=index;}
  });
  return score>.15?best:-1;
}

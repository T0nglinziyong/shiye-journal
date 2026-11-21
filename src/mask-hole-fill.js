export function fillEnclosedAlphaHoles(alpha,width,height){
  if(!alpha||width<3||height<3||alpha.length!==width*height)return alpha;
  const seen=new Uint8Array(alpha.length),queue=new Int32Array(alpha.length);
  let head=0,tail=0;
  const add=index=>{
    if(alpha[index]>=250||seen[index])return;
    seen[index]=1;queue[tail++]=index;
  };
  for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}
  for(let y=1;y<height-1;y++){add(y*width);add(y*width+width-1);}
  while(head<tail){
    const index=queue[head++],x=index%width,y=(index/width)|0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const nx=x+dx,ny=y+dy;
      if(nx>=0&&nx<width&&ny>=0&&ny<height)add(ny*width+nx);
    }
  }
  let filled=null;
  for(let i=0;i<alpha.length;i++)if(alpha[i]<250&&!seen[i]){
    if(!filled)filled=new Uint8Array(alpha);
    filled[i]=255;
  }
  return filled||alpha;
}

export function fillCandidateMaskHoles(candidate){
  const mask=candidate?.mask;
  if(!mask?.alpha?.length)return candidate;
  const alpha=fillEnclosedAlphaHoles(mask.alpha,mask.width,mask.height);
  if(alpha===mask.alpha)return candidate;
  let pixels=0;
  for(const value of alpha)if(value>=128)pixels++;
  return {...candidate,pixels,mask:{...mask,alpha,topologyPreserved:true,apertureRegions:[]}};
}

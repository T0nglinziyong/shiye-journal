// Every completed manual geometry is authoritative. Never search an enlarged
// axis-aligned window or replace it with a different automatically found object.
// A blank manual rectangle can yield a full mask from the segmenter's seed.
// Require visible pixel variation in and just around the user-drawn area first.
export function hasManualForegroundEvidence(pixels,width,height,box){
  if(!pixels||pixels.length<width*height*4||!Number.isFinite(width)||!Number.isFinite(height))return false;
  const x0=Math.max(0,Math.floor((box.x-box.w*.06)*width)),y0=Math.max(0,Math.floor((box.y-box.h*.06)*height));
  const x1=Math.min(width,Math.ceil((box.x+box.w*1.06)*width)),y1=Math.min(height,Math.ceil((box.y+box.h*1.06)*height));
  if(x1<=x0||y1<=y0)return false;
  const step=Math.max(1,Math.floor(Math.max(x1-x0,y1-y0)/256)),low=[255,255,255],high=[0,0,0];
  for(let y=y0;y<y1;y+=step)for(let x=x0;x<x1;x+=step){
    const index=(y*width+x)*4;
    for(let channel=0;channel<3;channel++){const value=pixels[index+channel];low[channel]=Math.min(low[channel],value);high[channel]=Math.max(high[channel],value);}
  }
  return high.some((value,channel)=>value-low[channel]>=10);
}

export async function refineManualBoxes(boxes,_previous,segment){
  const next=[];
  for(let index=0;index<boxes.length;index++){
    const box=boxes[index];
    if(!(box.w>0&&box.h>0))throw Error('候选框尺寸无效');
    const region=await segment(box,index);
    if(!region?.mask)throw Error('第 '+(index+1)+' 个旋转框分割失败，未覆盖原素材');
    next.push({region,original:null});
  }
  return next;
}

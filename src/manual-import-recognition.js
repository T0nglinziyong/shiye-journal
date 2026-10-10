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

// The edit frame is an editable view of the existing recognition result.
// Keep sourceIndex stable, so an unchanged automatic mask is always reused.
// New / edited frames must be normalized to the same page-coordinate box
// contract used by the automatic process-material-boxes task.
export function manualBoxGeometry(box){
  const {x,y,w,h}=box||{};
  if(![x,y,w,h].every(Number.isFinite)||!(w>0&&h>0)||
     x<0||y<0||x+w>1.00001||y+h>1.00001)
    throw Error('候选框尺寸或坐标无效，请调整框的位置');
  const rotation=Number.isFinite(box.rotation)?box.rotation:0;
  return {
    x,y,w,h,
    orientedBox:{
      centerX:x+w/2,centerY:y+h/2,width:w,height:h,
      rotation,rectangularity:1,autoDeskew:true,source:'manual'
    },
    // The original detection pipeline uses this exact candidate structure.
    seedDensity:Number.isFinite(box.seedDensity)?box.seedDensity:1,
    fillRatio:Number.isFinite(box.fillRatio)?box.fillRatio:1
  };
}
export function unchangedManualBox(box,previous){
  const candidate=Number.isInteger(box?.sourceIndex)?previous[box.sourceIndex]:null;
  if(!candidate||box.manualChanged)return null;
  return candidate;
}
export async function refineManualBoxes(boxes,previous,segment){
  const next=[];
  for(let index=0;index<boxes.length;index++){
    const box=boxes[index];
    const original=unchangedManualBox(box,previous);
    if(original){
      next.push({region:original.region,original});continue;
    }
    const geometry=manualBoxGeometry(box);
    const region=await segment(geometry,index,box);
    if(!region?.mask?.alpha?.length||!Number.isFinite(region.w)||!Number.isFinite(region.h))
      throw Error('第 '+(index+1)+' 个旋转框没有得到有效素材轮廓；原素材未修改');
    next.push({region,original:null});
  }
  return next;
}

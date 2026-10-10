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
export function manualBoxGeometry(box,{pagePixelWidth=1,pagePixelHeight=1}={}){
  const {x,y,w,h}=box||{};
  if(![x,y,w,h].every(Number.isFinite)||!(w>0&&h>0)||
     x<0||y<0||x+w>1.00001||y+h>1.00001)
    throw Error('候选框尺寸或坐标无效，请调整框的位置');
  const rotation=Number.isFinite(box.rotation)?box.rotation:0;
  // The editable rectangle is rotated about its centre, but MorphGAC works on
  // a page-aligned ROI. Its input box MUST enclose the rotated rectangle,
  // otherwise even a tiny rotation can cut through the actual foreground.
  const cx=x+w/2,cy=y+h/2,angle=rotation*Math.PI/180;
  const ratioX=Math.abs(Math.cos(angle))*w+
    Math.abs(Math.sin(angle))*h*pagePixelHeight/pagePixelWidth;
  const ratioY=Math.abs(Math.sin(angle))*w*pagePixelWidth/pagePixelHeight+
    Math.abs(Math.cos(angle))*h;
  const left=Math.max(0,cx-ratioX/2),top=Math.max(0,cy-ratioY/2),
    right=Math.min(1,cx+ratioX/2),bottom=Math.min(1,cy+ratioY/2);
  return {
    x:left,y:top,w:right-left,h:bottom-top,
    orientedBox:{
      centerX:x+w/2,centerY:y+h/2,width:w,height:h,
      rotation,rectangularity:1,autoDeskew:true,source:'manual'
    },
    // The original detection pipeline uses this exact candidate structure.
    seedDensity:Number.isFinite(box.seedDensity)?box.seedDensity:1,
    fillRatio:Number.isFinite(box.fillRatio)?box.fillRatio:1
  };
}

/**
 * If the automatic refiner cannot segment a user-drawn frame, preserve the
 * exact rotated rectangle as a visibly flagged candidate. Unlike filling its
 * axis-aligned bounding box, this mask does not include adjacent materials
 * in the corners when the user rotates the frame.
 */
export function manualFrameFallbackRegion(geometry,{pagePixelWidth=1,pagePixelHeight=1}={}){
  if(!geometry?.orientedBox||!Number.isFinite(pagePixelWidth)||
     !Number.isFinite(pagePixelHeight)||pagePixelWidth<=0||pagePixelHeight<=0)
    throw Error('手动框回退所需的页面尺寸无效');
  const width=Math.max(1,Math.round(geometry.w*pagePixelWidth));
  const height=Math.max(1,Math.round(geometry.h*pagePixelHeight));
  const alpha=new Uint8Array(width*height),o=geometry.orientedBox;
  const angle=o.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const cx=o.centerX*pagePixelWidth,cy=o.centerY*pagePixelHeight;
  const halfWidth=o.width*pagePixelWidth/2,halfHeight=o.height*pagePixelHeight/2;
  for(let y=0;y<height;y++){
    const py=(geometry.y+(y+.5)*geometry.h/height)*pagePixelHeight;
    for(let x=0;x<width;x++){
      const px=(geometry.x+(x+.5)*geometry.w/width)*pagePixelWidth;
      const dx=px-cx,dy=py-cy;
      if(Math.abs(dx*c+dy*s)<=halfWidth+1e-6&&
         Math.abs(-dx*s+dy*c)<=halfHeight+1e-6)alpha[y*width+x]=255;
    }
  }
  return {...geometry,segmentationMethod:'manual-frame-fallback',
    manualFallback:true,recognitionFallback:true,
    mask:{width,height,alpha,polygons:[],topologyPreserved:true}};
}

// A manual correction must survive empty contours, low contrast, and worker
// failures. Successful CV masks remain untouched; failures preserve the user's
// geometry and are marked pending review in the import candidate list.
export async function segmentManualOrFallback(geometry,segment,options={},onFallback=()=>{}){
  try{
    const result=await segment(geometry);
    if(!result?.mask?.alpha?.some(value=>value>16)||
       !Number.isFinite(result.w)||!Number.isFinite(result.h)||
       result.w<=0||result.h<=0||result.segmentationFailed)
      throw Error('分割未返回有效前景');
    return result;
  }catch(error){
    onFallback(error);
    return manualFrameFallbackRegion(geometry,options);
  }
}

export function unchangedManualBox(box,previous){
  const candidate=Number.isInteger(box?.sourceIndex)?previous[box.sourceIndex]:null;
  if(!candidate||box.manualChanged)return null;
  return candidate;
}
export async function refineManualBoxes(boxes,previous,segment,geometryOptions={}){
  const next=[];
  for(let index=0;index<boxes.length;index++){
    const box=boxes[index];
    const original=unchangedManualBox(box,previous);
    if(original){
      next.push({region:original.region,original});continue;
    }
    const geometry=manualBoxGeometry(box,geometryOptions);
    const region=await segment(geometry,index,box);
    if(!region?.mask?.alpha?.length||!Number.isFinite(region.w)||!Number.isFinite(region.h))
      throw Error('第 '+(index+1)+' 个旋转框没有得到有效素材轮廓；原素材未修改');
    next.push({region,original:null});
  }
  return next;
}

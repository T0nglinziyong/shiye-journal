import {itemFromAsset} from './domain.js';

const point=p=>Array.isArray(p)?p:[p.x,p.y];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function tapeDimensions(asset){
  const w=Number(asset?.physicalWidthMM),h=Number(asset?.physicalHeightMM);
  if(!(w>0&&h>0))throw Error('胶带需要先确认真实长宽');
  const axis=asset.tapeAxis==='y'?'y':asset.tapeAxis==='x'?'x':w>=h?'x':'y';
  return {axis,widthMM:axis==='x'?h:w,lengthMM:axis==='x'?w:h};
}
export function processTapeAsset(asset,{repeatable=false,periodMM=null,axis}={}){
  if(asset.kind!=='tape')throw Error('只有胶带素材可以设置连续纹样');
  const next={...asset,tapeAxis:axis==='y'?'y':'x',
    tapeRepeatMode:repeatable?'repeatablePattern':'singleStrip',
    tapeRepeatPeriodMM:repeatable?Number(periodMM):null,
    updatedAt:new Date().toISOString()};
  const dimensions=tapeDimensions(next);
  if(repeatable&&(!(next.tapeRepeatPeriodMM>0)||next.tapeRepeatPeriodMM>dimensions.lengthMM))
    throw Error('重复周期必须大于 0，且不能超过拍到的胶带长度');
  return next;
}
export function createTapeStrip(asset,draft,rawPoints,zIndex=10){
  if(asset?.kind!=='tape'||!Array.isArray(rawPoints)||rawPoints.length<2)throw Error('请选择胶带后拖动画布');
  const {axis,widthMM,lengthMM}=tapeDimensions(asset),scale=draft.canvas.height/(draft.physicalPageHeightMM||297);
  const path=[];
  for(const raw of rawPoints){const p=point(raw);
    if(!p.every(Number.isFinite))throw Error('胶带轨迹坐标无效');
    if(!path.length||distance(path.at(-1),p)>.8)path.push(p);
  }
  if(path.length<2)throw Error('请拖出一段胶带');
  if(path.length>512){const stride=Math.ceil(path.length/512);const sampled=path.filter((_,i)=>i%stride===0);
    if(sampled.at(-1)!==path.at(-1))sampled.push(path.at(-1));path.splice(0,path.length,...sampled);}
  // Store the same smoothed centerline used for rendering, so physical tape
  // length and the visible ribbon agree even with noisy touch samples.
  path.splice(0,path.length,...renderPath(path,widthMM*scale));
  const lengthPx=path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0),pathLengthMM=lengthPx/scale;
  if(pathLengthMM<2)throw Error('胶带段至少要有 2 mm');
  const repeatable=asset.tapeRepeatMode==='repeatablePattern'&&Number(asset.tapeRepeatPeriodMM)>0;
  if(!repeatable&&pathLengthMM>lengthMM+.1)throw Error(`这张胶带只拍到 ${lengthMM.toFixed(1)} mm；请在“编辑素材信息 → 尺寸与胶带”确认纹样周期后再画更长`);
  const bandWidthScene=widthMM*scale,half=bandWidthScene/2,
    xs=path.map(p=>p[0]),ys=path.map(p=>p[1]),
    left=Math.min(...xs)-half,top=Math.min(...ys)-half,
    width=Math.max(...xs)+half-left,height=Math.max(...ys)+half-top;
  const x=left+width/2,y=top+height/2,
    item=itemFromAsset(asset,draft,x,y,zIndex);
  item.x=x;item.y=y;item.width=width;item.height=height;item.rotation=0;
  item.manualVisualResize=true;
  item.tapeStrip={version:1,axis,points:path.map(p=>[(p[0]-left)/width,(p[1]-top)/height]),
    bandWidthScene,baseWidth:width,baseHeight:height,pathLengthMM,
    sourceLengthMM:lengthMM,sourcePeriodMM:repeatable?Number(asset.tapeRepeatPeriodMM):lengthMM};
  item.generationBaseline={...item.generationBaseline,x,y,width,height,rotation:0};
  return item;
}
export function validateTapeStrip(strip,asset){
  const {axis,widthMM,lengthMM}=tapeDimensions({...asset,tapeAxis:strip?.axis});
  if(strip?.version!==1||strip.axis!==axis||!Array.isArray(strip.points)||
    strip.points.length<2||strip.points.length>512||strip.points.some(p=>
      !Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1))||
    ![strip.bandWidthScene,strip.baseWidth,strip.baseHeight,strip.pathLengthMM,
      strip.sourceLengthMM,strip.sourcePeriodMM].every(v=>Number.isFinite(v)&&v>0)||
    Math.abs(strip.sourceLengthMM-lengthMM)>.1)throw Error('胶带段轨迹或实物尺寸无效');
  if(strip.sourcePeriodMM>lengthMM+.1)throw Error('胶带纹样周期超出源照片');
  const path=strip.points.map(([u,v])=>[u*strip.baseWidth,v*strip.baseHeight]);
  const measured=path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0)*widthMM/strip.bandWidthScene;
  if(Math.abs(measured-strip.pathLengthMM)>.15)throw Error('胶带轨迹长度与真实尺寸不一致');
  return widthMM;
}
const preparedImages=new WeakMap();
// Pointer events are much denser than the pixels in a photographed tape.
// Rendering each event as its own image slice makes the browser repeatedly
// sample a subpixel-wide source column, which appears as vertical slats.
function renderPath(points,band){
  const tolerance=Math.max(.8,band*.08);
  const simplify=(start,end)=>{
    const a=points[start],b=points[end],dx=b[0]-a[0],dy=b[1]-a[1],
      length=Math.hypot(dx,dy)||1;
    let far=0,index=-1;
    for(let i=start+1;i<end;i++){
      const p=points[i],distance=Math.abs(dx*(a[1]-p[1])-dy*(a[0]-p[0]))/length;
      if(distance>far){far=distance;index=i;}
    }
    if(far<=tolerance)return [a,b];
    return [...simplify(start,index).slice(0,-1),...simplify(index,end)];
  };
  return points.length>2?simplify(0,points.length-1):points;
}
function orientedImage(image,axis){
  const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
  let prepared=preparedImages.get(image);if(!prepared){
    const scale=Math.min(1,2048/Math.max(w,h)),raw=document.createElement('canvas');
    raw.width=Math.max(1,Math.round(w*scale));raw.height=Math.max(1,Math.round(h*scale));
    const ctx=raw.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0,raw.width,raw.height);
    let left=0,right=raw.width,top=0,bottom=raw.height;
    try{
      const {data}=ctx.getImageData(0,0,raw.width,raw.height),
        columns=new Uint32Array(raw.width),rows=new Uint32Array(raw.height);
      for(let y=0;y<raw.height;y++)for(let x=0;x<raw.width;x++)
        if(data[(y*raw.width+x)*4+3]>=24){columns[x]++;rows[y]++;}
      // Ignore isolated segmentation hairs. The physical width belongs to the
      // actual tape, even when a photographed/cutout PNG has empty padding.
      const xThreshold=Math.max(2,Math.ceil(raw.height*.08)),
        yThreshold=Math.max(2,Math.ceil(raw.width*.02));
      while(left<right-1&&columns[left]<xThreshold)left++;
      while(right>left+1&&columns[right-1]<xThreshold)right--;
      while(top<bottom-1&&rows[top]<yThreshold)top++;
      while(bottom>top+1&&rows[bottom-1]<yThreshold)bottom--;
      left=Math.max(0,left-1);right=Math.min(raw.width,right+1);
      top=Math.max(0,top-1);bottom=Math.min(raw.height,bottom+1);
    }catch{/* An unreadable external image still renders without trimming. */}
    const trimmed=document.createElement('canvas');trimmed.width=right-left;trimmed.height=bottom-top;
    trimmed.getContext('2d').drawImage(raw,left,top,trimmed.width,trimmed.height,
      0,0,trimmed.width,trimmed.height);
    prepared={x:trimmed};preparedImages.set(image,prepared);
  }
  if(axis==='x')return prepared.x;
  if(!prepared.y){const source=prepared.x,rotated=document.createElement('canvas');
    rotated.width=source.height;rotated.height=source.width;
    const ctx=rotated.getContext('2d');ctx.translate(0,source.width);
    ctx.rotate(-Math.PI/2);ctx.drawImage(source,0,0);
    prepared.y=rotated;}
  return prepared.y;
}
export function paintTapeStrip(ctx,node,image){
  const strip=node.tapeStrip;if(!strip)return false;
  const texture=orientedImage(image,strip.axis),w=texture.width,h=texture.height;
  const sx=node.width/strip.baseWidth,sy=node.height/strip.baseHeight,
    band=strip.bandWidthScene*Math.sqrt(sx*sy),points=renderPath(strip.points.map(([u,v])=>
      [(u-.5)*node.width,(v-.5)*node.height]),band);
  const lengths=points.slice(1).map((p,i)=>distance(points[i],p)),
    total=lengths.reduce((sum,n)=>sum+n,0);
  if(!(total>0))return true;
  let travelled=0;
  for(let i=0;i<lengths.length;i++){
    const a=points[i],b=points[i+1],segment=lengths[i];if(segment<.01)continue;
    const angle=Math.atan2(b[1]-a[1],b[0]-a[0]),
      startMM=travelled/total*strip.pathLengthMM,
      endMM=(travelled+segment)/total*strip.pathLengthMM;
    let from=startMM;
    while(from<endMM-1e-6){
      const period=strip.sourcePeriodMM,phase=((from%period)+period)%period,
        to=Math.min(endMM,from+period-phase),offset=(from-startMM)/(endMM-startMM)*segment,
        length=(to-from)/(endMM-startMM)*segment;
      ctx.save();ctx.translate(a[0]+Math.cos(angle)*offset,a[1]+Math.sin(angle)*offset);
      ctx.rotate(angle);
      ctx.drawImage(texture,clamp(phase/strip.sourceLengthMM*w,0,w-.001),0,
        Math.max(.001,Math.min(w-phase/strip.sourceLengthMM*w,
          (to-from)/strip.sourceLengthMM*w)),h,
        0,-band/2,length+.35,band);
      ctx.restore();from=to;
    }
    travelled+=segment;
  }
  return true;
}

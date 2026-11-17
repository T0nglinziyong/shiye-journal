import {applyLightingToCrop} from './material-color-restoration.js';
import {segmentPaperMaterials} from './paper-analysis.js';
import {visionTask} from './vision-runtime.js';
import {recognitionProfile} from './recognition-profiles.js';
import {analysisPixels,sourcePixels} from './recognition-raster.js';
import {neutralizePaperChroma} from './paper-chroma-preprocess.js';
import {finalizeCandidates} from './recognition-refiners.js';
export function reprocessPaperCandidates(analysis,{mergeSharedCarrier=true,postprocess={},onProgress=()=>{}}={}){
  return finalizeCandidates({...analysis,mergeSharedCarrier,postprocess,onProgress,onAnalysis:()=>{}});
}
// Analyze a small copy, but re-extract accepted cuts from the full source.
export async function detectPaperCandidates(bitmap,box,smallestMM=6,{
  balanceLight=false,paperRectified=false,paperWidthMM=210,paperHeightMM=297,
  recognition='auto',candidateDiscovery='unified',recognitionPixels=900,
  recognitionPreprocess={},recognitionPostprocess={},mergeSharedCarrier=true,onProgress=()=>{},onDiagnostic=()=>{},onAnalysis=()=>{},recognitionSource=null
}={}){
  const profile=recognitionProfile(recognition,recognitionPixels);
  // A single discovery scale keeps material identities and candidate geometry
  // stable when the user raises the boundary-refinement resolution. The final
  // cutout is still sampled from the original bitmap in cropBitmap.
  const discoveryRatio=Math.min(1,900/Math.max(bitmap.width*box.w,bitmap.height*box.h));
  const researchPage=paperRectified&&candidateDiscovery==='unified'&&recognitionSource,
    dw=researchPage?(paperWidthMM>=paperHeightMM?900:Math.round(900*paperWidthMM/paperHeightMM))
      :Math.max(1,Math.round(bitmap.width*box.w*discoveryRatio)),
    dh=researchPage?(paperWidthMM>=paperHeightMM?Math.round(900*paperHeightMM/paperWidthMM):900)
      :Math.max(1,Math.round(bitmap.height*box.h*discoveryRatio));
  const discoveryPixels=recognitionSource&&paperRectified&&candidateDiscovery==='unified'
    ?(await visionTask('warp-research',{
      pixels:sourcePixels(recognitionSource.bitmap),transferInput:true,
      sourceWidth:recognitionSource.bitmap.width,sourceHeight:recognitionSource.bitmap.height,
      corners:recognitionSource.corners,width:dw,height:dh
    })).pixels
    :await analysisPixels(bitmap,box,dw,dh);
  // The research V8 detector evaluates the measured exterior on corrected
  // RGB. Chroma neutralization changes weak paper edges and candidate count.
  const discoveryFrame={data:paperRectified&&candidateDiscovery!=='unified'&&candidateDiscovery!=='research'
    ?neutralizePaperChroma(discoveryPixels,dw,dh):discoveryPixels,width:dw,height:dh};
  // V8's candidate mask and V5's arbitration share the same 900px raster.
  // Higher display/export quality still comes from the full corrected source.
  const ratio=candidateDiscovery==='unified'&&researchPage?null:candidateDiscovery==='unified'?discoveryRatio
    :Math.min(1,profile.analysisMaxDimension/Math.max(bitmap.width*box.w,bitmap.height*box.h));
  const w=researchPage?dw:Math.max(1,Math.round(bitmap.width*box.w*ratio)),
    h=researchPage?dh:Math.max(1,Math.round(bitmap.height*box.h*ratio));
  const frame={data:w===dw&&h===dh?discoveryPixels:await analysisPixels(bitmap,box,w,h),width:w,height:h},
    preprocess={
      illumination:balanceLight===true&&recognitionPreprocess.illumination===true,
      denoise:recognitionPreprocess.denoise===true,
      localContrast:recognitionPreprocess.localContrast===true,
      chromaEdges:recognitionPreprocess.chromaEdges!==false
    },
    needsRasterPreprocess=preprocess.illumination||preprocess.denoise||preprocess.localContrast,
    processed=needsRasterPreprocess
      ?await visionTask('balance',{pixels:frame.data,width:w,height:h,options:preprocess})
      :null,
    segmentationFrame=processed?{data:processed.pixels,width:w,height:h}:frame;

  // Box discovery always uses the original rectified RGB. Real-case ablation
  // showed that illumination/CLAHE/denoise can make identity discovery worse.
  // Optional preprocessing therefore affects boundary segmentation only.
  const candidates=await segmentPaperMaterials(discoveryFrame,{
    smallestMM,paperWidthMM,paperHeightMM,sourcePixels:discoveryFrame.data,chromaEdges:preprocess.chromaEdges,mergeSharedCarrier:true,candidateDiscovery
  });
  onDiagnostic({phase:'boxes',count:candidates.length,
    dimensions:[dw,dh],refinementDimensions:[w,h],mode:profile.mode,candidateDiscovery,smallestMM,
    boxes:candidates.map(item=>({x:item.x,y:item.y,w:item.w,h:item.h,
      evidenceDensity:item.evidenceDensity,seedDensity:item.seedDensity,
      fillRatio:item.fillRatio,absorbedFragments:item.absorbedFragments,
      boundarySource:item.boundarySource||null,boundaryPrior:item.boundaryPrior??null,
      physicalBoundary:item.physicalBoundary||null,
      observedPhysicalBoundary:item.observedPhysicalBoundary||null,
      needsBoundaryReview:item.needsBoundaryReview===true}))});
  return profile.refineCandidates&&candidates.length
    ? profile.refineCandidates({
        candidates,
        frame:segmentationFrame,
        sourceFrame:frame,
        width:w,height:h,
        paperWidthMM,paperHeightMM,mergeSharedCarrier,candidateDiscovery,
        preprocess,
        postprocess:recognitionPostprocess,
        onProgress,onAnalysis
      })
    : candidates;
}
// Output-only subpixel smoothing for jagged free-form cutout pixels.
// This returns a new buffer and never mutates region.mask.alpha or recognition.
export function softenOutputAlpha(alpha,width,height){
  if(!alpha||alpha.length!==width*height)return alpha;
  const result=new Uint8Array(alpha);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,center=alpha[i];
    let min=center,max=center,sum=0,weight=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const xx=x+dx,yy=y+dy,w=(dx===0?2:1)*(dy===0?2:1);
      const v=xx>=0&&xx<width&&yy>=0&&yy<height?alpha[yy*width+xx]:0;
      min=Math.min(min,v);max=Math.max(max,v);sum+=v*w;weight+=w;
    }
    if(min!==max)result[i]=Math.round(sum/weight);
  }
  return result;
}
export function candidateCropBounds(bitmapWidth,bitmapHeight,paper,region){
  const left=Math.max(0,Math.min(bitmapWidth-1,Math.round(bitmapWidth*(paper.x+region.x*paper.w))));
  const top=Math.max(0,Math.min(bitmapHeight-1,Math.round(bitmapHeight*(paper.y+region.y*paper.h))));
  // Round the two edges in the same coordinate system. Rounding the start
  // and the width independently can shift the right/bottom edge by one pixel
  // when a 1024px model mask is placed on a high-resolution rectification.
  const right=Math.max(left+1,Math.min(bitmapWidth,Math.round(bitmapWidth*(paper.x+(region.x+region.w)*paper.w))));
  const bottom=Math.max(top+1,Math.min(bitmapHeight,Math.round(bitmapHeight*(paper.y+(region.y+region.h)*paper.h))));
  return {x:left,y:top,w:right-left,h:bottom-top};
}
// Smooth the enlarged export alpha and restore a narrow edge. The stored mask stays editable.
export function outputMaskBlurPx(region,outputWidth,outputHeight){
  const mask=region?.mask;
  if(!mask?.width||!mask?.height)return 0;
  const modelMask=/^(sam2-|fastsam|yoloe)/.test(region.segmentationMethod||'');
  if(!modelMask)return .45;
  const scale=Math.max(outputWidth/mask.width,outputHeight/mask.height);
  return Math.round(Math.min(region.maskAntialias?3.5:3,
    Math.max(.7,scale*(region.maskAntialias ? .85 : .72)))*100)/100;
}
export function sharpenExportAlpha(alpha){
  const t=Math.max(0,Math.min(1,(alpha/255-.32)/.36));
  return Math.round((t*t*(3-2*t))*255);
}
export function enclosedMaskHoles(mask){
  const {width,height,alpha}=mask,total=width*height;
  const seen=new Uint8Array(total),queue=new Uint32Array(total);let tail=0;
  const add=i=>{if(!seen[i]&&alpha[i]<128){seen[i]=1;queue[tail++]=i;}};
  for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}
  for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
  for(let head=0;head<tail;head++){
    const i=queue[head],x=i%width,y=(i-x)/width;
    if(x)add(i-1);if(x+1<width)add(i+1);
    if(y)add(i-width);if(y+1<height)add(i+width);
  }
  const holes=new Uint8Array(total);
  for(let i=0;i<total;i++)if(alpha[i]<128&&!seen[i])holes[i]=1;
  return holes;
}
export function polishProjectedMask(pixels,width,height,radius,mask=null){
  const data=pixels.data,r=Math.max(1,Math.min(4,Math.round(radius))),span=r*2+1;
  const horizontal=new Uint8Array(width*height);
  const holes=mask?enclosedMaskHoles(mask):null;
  for(let y=0;y<height;y++){
    const row=y*width;
    let sum=data[row*4+3]*r;
    for(let x=0;x<=r;x++)sum+=data[(row+Math.min(x,width-1))*4+3];
    for(let x=0;x<width;x++){
      horizontal[row+x]=Math.round(sum/span);
      sum+=data[(row+Math.min(width-1,x+r+1))*4+3]
        -data[(row+Math.max(0,x-r))*4+3];
    }
  }
  for(let x=0;x<width;x++){
    let sum=horizontal[x]*r;
    for(let y=0;y<=r;y++)sum+=horizontal[Math.min(y,height-1)*width+x];
    for(let y=0;y<height;y++){
      const i=(y*width+x)*4+3;
      const hole=holes?.[Math.min(mask.height-1,Math.floor((y+.5)*mask.height/height))*mask.width+
        Math.min(mask.width-1,Math.floor((x+.5)*mask.width/width))];
      const alpha=sharpenExportAlpha(Math.round(sum/span));
      data[i]=hole?Math.min(alpha,data[i]):alpha;
      sum+=horizontal[Math.min(height-1,y+r+1)*width+x]
        -horizontal[Math.max(0,y-r)*width+x];
    }
  }
  return pixels;
}
export async function cropBitmap(bitmap,paper,region,{raw=false,lighting=null}={}){
  const {x,y,w,h}=candidateCropBounds(bitmap.width,bitmap.height,paper,region);
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(bitmap,x,y,w,h,0,0,w,h);
  if(!raw&&lighting)applyLightingToCrop(ctx,x,y,w,h,bitmap.width,bitmap.height,lighting);
  if(region.mask&&!raw){
    const m=region.mask,mask=document.createElement('canvas');mask.width=m.width;mask.height=m.height;
    const mc=mask.getContext('2d'),frame=mc.createImageData(m.width,m.height);
    const modelMask=/^(sam2-|fastsam|yoloe)/.test(region.segmentationMethod||'');
    const outputAlpha=region.shapeModel||modelMask?m.alpha:softenOutputAlpha(m.alpha,m.width,m.height);
    for(let i=0;i<outputAlpha.length;i++){frame.data[i*4]=frame.data[i*4+1]=frame.data[i*4+2]=255;frame.data[i*4+3]=outputAlpha[i];}
    mc.putImageData(frame,0,0);
    ctx.globalCompositeOperation='destination-in';
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    if(modelMask){
      const projected=document.createElement('canvas');projected.width=w;projected.height=h;
      const pc=projected.getContext('2d',{willReadFrequently:true});
      pc.imageSmoothingEnabled=true;pc.imageSmoothingQuality='high';
      pc.drawImage(mask,0,0,w,h);
      pc.putImageData(polishProjectedMask(pc.getImageData(0,0,w,h),w,h,
        outputMaskBlurPx(region,w,h),m),0,0);
      ctx.drawImage(projected,0,0);
    }else{
      ctx.filter=`blur(${outputMaskBlurPx(region,w,h)}px)`;
      ctx.drawImage(mask,0,0,w,h);ctx.filter='none';
    }
    ctx.globalCompositeOperation='source-over';
  }
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('素材裁图失败')),'image/png'));
}
export async function alignMaterialPreview(blob,originalBlob=blob,rotation=null){
  const bitmap=await createImageBitmap(blob),original=await createImageBitmap(originalBlob);
  try{const probe=document.createElement('canvas');const analysisScale=Math.min(1,800/Math.max(bitmap.width,bitmap.height));probe.width=Math.max(1,Math.round(bitmap.width*analysisScale));probe.height=Math.max(1,Math.round(bitmap.height*analysisScale));const pc=probe.getContext('2d',{willReadFrequently:true});pc.drawImage(bitmap,0,0,probe.width,probe.height);const pixels=pc.getImageData(0,0,probe.width,probe.height),alpha=new Uint8Array(probe.width*probe.height);for(let i=0;i<alpha.length;i++)alpha[i]=pixels.data[i*4+3];const degrees=rotation??(await visionTask('alignment',{alpha,width:probe.width,height:probe.height})).degrees,rad=degrees*Math.PI/180;
    const w=Math.ceil(Math.abs(bitmap.width*Math.cos(rad))+Math.abs(bitmap.height*Math.sin(rad))),h=Math.ceil(Math.abs(bitmap.height*Math.cos(rad))+Math.abs(bitmap.width*Math.sin(rad)));
    const render=source=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.translate(w/2,h/2);ctx.rotate(rad);ctx.drawImage(source,-bitmap.width/2,-bitmap.height/2,bitmap.width,bitmap.height);ctx.resetTransform();return c;},saved=render(bitmap),source=render(original),ctx=saved.getContext('2d',{willReadFrequently:true}),data=ctx.getImageData(0,0,w,h).data;let l=w,r=0,t=h,b=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>8){l=Math.min(l,x);r=Math.max(r,x+1);t=Math.min(t,y);b=Math.max(b,y+1);}if(r<=l||b<=t){l=0;r=w;t=0;b=h;}
    l=Math.max(0,l-2);t=Math.max(0,t-2);r=Math.min(w,r+2);b=Math.min(h,b+2);
    const extract=canvas=>{const c=document.createElement('canvas');c.width=r-l;c.height=b-t;c.getContext('2d').drawImage(canvas,l,t,c.width,c.height,0,0,c.width,c.height);return new Promise((resolve,reject)=>c.toBlob(v=>v?resolve(v):reject(Error('扶正图像失败')),'image/png'));};
    const canvasBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(Error('候选框原图保存失败')),'image/png'));
    return {
      blob:await extract(saved),
      originalBlob:await extract(source),
      candidateFrameBlob:await canvasBlob(source),
      candidateFramePlacement:{x:l,y:t,width:r-l,height:b-t,frameWidth:w,frameHeight:h},
      degrees,widthRatio:(r-l)/bitmap.width,heightRatio:(b-t)/bitmap.height
    };
  }finally{bitmap.close();original.close();}
}

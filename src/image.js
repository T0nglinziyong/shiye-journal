import {applyLightingToCrop} from './material-color-restoration.js';
import {segmentPaperMaterials} from './paper-analysis.js';
import {visionTask} from './vision-runtime.js';
import {recognitionProfile} from './recognition-profiles.js';
import {analysisPixels} from './recognition-raster.js';
import {neutralizePaperChroma} from './paper-chroma-preprocess.js';
// Analyze a small copy, but re-extract accepted cuts from the full source.
export async function detectPaperCandidates(bitmap,box,smallestMM=6,{
  balanceLight=false,paperRectified=false,paperWidthMM=210,paperHeightMM=297,
  recognition='auto',recognitionPixels=900,
  recognitionPreprocess={},recognitionPostprocess={},mergeSharedCarrier=true,onProgress=()=>{},onDiagnostic=()=>{},onAnalysisRaster=()=>{}
}={}){
  const profile=recognitionProfile(recognition,recognitionPixels);
  // A single discovery scale keeps material identities and candidate geometry
  // stable when the user raises the boundary-refinement resolution. The final
  // cutout is still sampled from the original bitmap in cropBitmap.
  const discoveryRatio=Math.min(1,900/Math.max(bitmap.width*box.w,bitmap.height*box.h));
  const dw=Math.max(1,Math.round(bitmap.width*box.w*discoveryRatio)),dh=Math.max(1,Math.round(bitmap.height*box.h*discoveryRatio));
  const discoveryPixels=await analysisPixels(bitmap,box,dw,dh);
  // Give the downstream colour-only paper-light estimator the same source
  // analysis raster instead of rescaling the full corrected page again.
  // This callback never changes boxes, refinement settings or alpha masks.
  onAnalysisRaster({data:discoveryPixels,width:dw,height:dh});
  const discoveryFrame={data:paperRectified?neutralizePaperChroma(discoveryPixels,dw,dh):discoveryPixels,width:dw,height:dh};
  const ratio=Math.min(1,profile.analysisMaxDimension/Math.max(bitmap.width*box.w,bitmap.height*box.h));
  const w=Math.max(1,Math.round(bitmap.width*box.w*ratio)),h=Math.max(1,Math.round(bitmap.height*box.h*ratio));
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
  const discovered=await segmentPaperMaterials(discoveryFrame,{
    smallestMM,paperWidthMM,paperHeightMM,sourcePixels:discoveryFrame.data,chromaEdges:preprocess.chromaEdges,mergeSharedCarrier
  });
  // Automatic-only physical size floor. Reject either side below 8 mm before
  // costly individual MorphGAC/GrabCut segmentation. Manual edits are not
  // routed through this function and remain explicitly user-authoritative.
  const candidates=discovered.filter(c=>{
    const widthMM=(c.orientedBox?.width||c.w)*paperWidthMM;
    const heightMM=(c.orientedBox?.height||c.h)*paperHeightMM;
    return Number.isFinite(widthMM)&&Number.isFinite(heightMM)&&
      widthMM>=8&&heightMM>=8;
  });
  onDiagnostic({phase:'boxes',count:candidates.length,
    dimensions:[dw,dh],refinementDimensions:[w,h],mode:profile.mode,smallestMM,minimumAutoSideMM:8,filteredBelow8MM:discovered.length-candidates.length,
    boxes:candidates.map(item=>({x:item.x,y:item.y,w:item.w,h:item.h,
      evidenceDensity:item.evidenceDensity,seedDensity:item.seedDensity,
      fillRatio:item.fillRatio,absorbedFragments:item.absorbedFragments}))});
  return profile.refineCandidates&&candidates.length
    ? profile.refineCandidates({
        candidates,
        frame:segmentationFrame,
        sourceFrame:frame,
        width:w,height:h,
        paperWidthMM,paperHeightMM,mergeSharedCarrier,
        preprocess,
        postprocess:recognitionPostprocess,
        onProgress
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
export async function cropBitmap(bitmap,paper,region,{raw=false,lighting=null}={}){
  const x=Math.max(0,Math.round(bitmap.width*(paper.x+region.x*paper.w))),y=Math.max(0,Math.round(bitmap.height*(paper.y+region.y*paper.h)));
  const w=Math.min(bitmap.width-x,Math.max(1,Math.round(bitmap.width*paper.w*region.w))),h=Math.min(bitmap.height-y,Math.max(1,Math.round(bitmap.height*paper.h*region.h)));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(bitmap,x,y,w,h,0,0,w,h);
  if(!raw&&lighting)applyLightingToCrop(ctx,x,y,w,h,bitmap.width,bitmap.height,lighting);
  if(region.mask&&!raw){
    const m=region.mask,mask=document.createElement('canvas');mask.width=m.width;mask.height=m.height;
    const mc=mask.getContext('2d'),frame=mc.createImageData(m.width,m.height);
    const outputAlpha=region.shapeModel?m.alpha:softenOutputAlpha(m.alpha,m.width,m.height);
    for(let i=0;i<outputAlpha.length;i++){frame.data[i*4]=frame.data[i*4+1]=frame.data[i*4+2]=255;frame.data[i*4+3]=outputAlpha[i];}
    mc.putImageData(frame,0,0);
    // The pixel alpha is authoritative. Rebuilding the cutout from only the
    // outer polygon destroys arbitrary topology (binder holes, windows,
    // die-cuts) and also discards graph-cut detail. Scale the actual mask
    // instead; polygons remain geometry metadata for editing/debugging.
    ctx.globalCompositeOperation='destination-in';
    // This is only sub-pixel raster antialiasing of the *exported* alpha.
    // The authoritative segmented mask, contour, identity and dimensions stay
    // byte-for-byte intact. In particular, no morphological shape edits run.
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.filter='blur(0.45px)';
    ctx.drawImage(mask,0,0,w,h);
    ctx.filter='none';ctx.globalCompositeOperation='source-over';
  }
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('素材裁图失败')),'image/png'));
}
export async function alignMaterialPreview(blob,originalBlob=blob,rotation=null){
  const bitmap=await createImageBitmap(blob),original=await createImageBitmap(originalBlob);
  try{
    // Auto-deskew already provides an authoritative rotation. In that case
    // avoid a redundant 800px resize, RGBA readback, alpha extraction and
    // separate OpenCV alignment task for every individual sticker.
    let degrees=rotation;
    if(degrees==null){
      const probe=document.createElement('canvas'),analysisScale=Math.min(1,800/Math.max(bitmap.width,bitmap.height));
      probe.width=Math.max(1,Math.round(bitmap.width*analysisScale));
      probe.height=Math.max(1,Math.round(bitmap.height*analysisScale));
      const pc=probe.getContext('2d',{willReadFrequently:true});
      pc.drawImage(bitmap,0,0,probe.width,probe.height);
      const pixels=pc.getImageData(0,0,probe.width,probe.height),alpha=new Uint8Array(probe.width*probe.height);
      for(let i=0;i<alpha.length;i++)alpha[i]=pixels.data[i*4+3];
      degrees=(await visionTask('alignment',{alpha,width:probe.width,height:probe.height})).degrees;
    }
    const rad=degrees*Math.PI/180;
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


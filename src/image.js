import {segmentPaperMaterials} from './paper-analysis.js';
import {visionTask} from './vision-runtime.js';
import {recognitionProfile} from './recognition-profiles.js';
// Analyze a small copy, but re-extract accepted cuts from the full source.
export async function detectPaperCandidates(bitmap,box,smallestMM=6,{balanceLight=false,paperWidthMM=210,paperHeightMM=297,recognition='auto',recognitionPixels=1200,recognitionPreprocess={},recognitionPostprocess={},onProgress=()=>{}}={}){
  const profile=recognitionProfile(recognition,recognitionPixels);
  const ratio=Math.min(1,profile.analysisMaxDimension/Math.max(bitmap.width*box.w,bitmap.height*box.h));
  const w=Math.max(1,Math.round(bitmap.width*box.w*ratio)),h=Math.max(1,Math.round(bitmap.height*box.h*ratio));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(bitmap,bitmap.width*box.x,bitmap.height*box.y,bitmap.width*box.w,bitmap.height*box.h,0,0,w,h);
  const frame=ctx.getImageData(0,0,w,h),
    preprocess={
      illumination:balanceLight!==false&&recognitionPreprocess.illumination!==false,
      denoise:recognitionPreprocess.denoise!==false,
      localContrast:recognitionPreprocess.localContrast!==false,
      chromaEdges:recognitionPreprocess.chromaEdges!==false
    },
    needsRasterPreprocess=preprocess.illumination||preprocess.denoise||preprocess.localContrast,
    processed=needsRasterPreprocess?await visionTask('balance',{pixels:frame.data,width:w,height:h,options:preprocess}):null;
  const candidates=await segmentPaperMaterials(processed?{data:processed.pixels,width:w,height:h}:frame,{smallestMM,paperWidthMM,paperHeightMM,sourcePixels:frame.data,chromaEdges:preprocess.chromaEdges,postprocess:recognitionPostprocess});
  return profile.refineCandidates&&candidates.length
    ? profile.refineCandidates({candidates,frame,width:w,height:h,preprocess,postprocess:recognitionPostprocess,onProgress})
    : candidates;
}
export async function cropBitmap(bitmap,paper,region,{raw=false}={}){
  const x=Math.max(0,Math.round(bitmap.width*(paper.x+region.x*paper.w))),y=Math.max(0,Math.round(bitmap.height*(paper.y+region.y*paper.h)));
  const w=Math.min(bitmap.width-x,Math.max(1,Math.round(bitmap.width*paper.w*region.w))),h=Math.min(bitmap.height-y,Math.max(1,Math.round(bitmap.height*paper.h*region.h)));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(bitmap,x,y,w,h,0,0,w,h);
  if(region.mask&&!raw){
    const m=region.mask,mask=document.createElement('canvas');mask.width=m.width;mask.height=m.height;
    const mc=mask.getContext('2d'),frame=mc.createImageData(m.width,m.height);
    for(let i=0;i<m.alpha.length;i++){frame.data[i*4]=frame.data[i*4+1]=frame.data[i*4+2]=255;frame.data[i*4+3]=m.alpha[i];}
    mc.putImageData(frame,0,0);
    // The pixel alpha is authoritative. Rebuilding the cutout from only the
    // outer polygon destroys arbitrary topology (binder holes, windows,
    // die-cuts) and also discards graph-cut detail. Scale the actual mask
    // instead; polygons remain geometry metadata for editing/debugging.
    ctx.globalCompositeOperation='destination-in';ctx.imageSmoothingEnabled=true;ctx.drawImage(mask,0,0,w,h);ctx.globalCompositeOperation='source-over';
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
    return {blob:await extract(saved),originalBlob:await extract(source),degrees,widthRatio:(r-l)/bitmap.width,heightRatio:(b-t)/bitmap.height};
  }finally{bitmap.close();original.close();}
}

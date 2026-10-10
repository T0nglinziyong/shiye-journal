// Deliberately independent of source-photo pixel dimensions and of CSS/DPR.
// The prior c6e5432d sample rectified to 3396 x 2401 in landscape. Reuse that
// exact raster so adopting a fixed size does not rescale the regression sample.
export const IMPORT_WORKING_LONG_EDGE_PX=3396;

export function fixedImportFrameSize(paperRatio){
  if(!Number.isFinite(paperRatio)||paperRatio<=0)throw Error('纸张比例无效');
  const height=Math.round(IMPORT_WORKING_LONG_EDGE_PX/Math.max(1,paperRatio));
  return {width:Math.round(height*paperRatio),height};
}

// The browser photo picker may display JPEG EXIF differently from the pinned
// decoder. Use the very same oriented bitmap for the interactive paper overlay;
// this display JPEG is NOT fed back into the recognition or export pipeline.
export async function importPhotoDisplayURL(bitmap,{maxEdge=1400}={}){
  const scale=Math.min(1,maxEdge/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));
  if(!blob)throw Error('照片预览转换失败');
  return URL.createObjectURL(blob);
}

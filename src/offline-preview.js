// Exported previews are visual hints. The original material is always kept
// in the library at full resolution. Safari can decode WebP while being unable
// to *encode* it: never fail a handoff solely for that capability difference.
export const OFFLINE_MATERIAL_EDGE=512;
export const OFFLINE_REFERENCE_EDGE=768;
export const OFFLINE_IMAGE_QUALITY=.86;
export const OFFLINE_PNG_MAX_BYTES=260_000;

export function isWebpBytes(bytes){
  return bytes?.length>=12&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&
    String.fromCharCode(...bytes.subarray(8,12))==='WEBP';
}
export function isPngBytes(bytes){
  return bytes?.length>=8&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&
    bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10;
}
export function isJpegBytes(bytes){
  return bytes?.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
}
// Validate the real bytes, not canvas.toBlob's requested type. Some WebKit
// versions silently return PNG when asked to encode WebP.
export function previewImageFormat(bytes){
  if(isWebpBytes(bytes))return {extension:'webp',mimeType:'image/webp'};
  if(isPngBytes(bytes))return {extension:'png',mimeType:'image/png'};
  if(isJpegBytes(bytes))return {extension:'jpg',mimeType:'image/jpeg'};
  return null;
}
const serialize=(canvas,type,quality)=>new Promise(resolve=>{
  try{canvas.toBlob(blob=>resolve(blob),type,quality);}
  catch{resolve(null);}
});
async function matchingBytes(blob,format){
  if(!blob?.size)return null;
  const bytes=new Uint8Array(await blob.arrayBuffer());
  return previewImageFormat(bytes)?.extension===format?bytes:null;
}
export async function offlinePreviewBytes(blob,{
  maxEdge=OFFLINE_MATERIAL_EDGE,quality=OFFLINE_IMAGE_QUALITY,
  // Only reference illustrations may be flattened to JPEG. Never flatten a
  // transparent material: its alpha is needed for GPT's shape reasoning.
  opaque=false,maxBytes=OFFLINE_PNG_MAX_BYTES
}={}){
  if(!(blob instanceof Blob)||!blob.size)throw Error('创作图片预览文件无效');
  const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');
  try{
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('无法生成素材预览');
    const draw=limit=>{
      const ratio=Math.min(1,limit/Math.max(bitmap.width,bitmap.height));
      canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
      canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality='high';
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    };
    draw(maxEdge);
    // WebP remains preferred on browsers that truly support its encoder.
    const webp=await matchingBytes(await serialize(canvas,'image/webp',quality),'webp');
    if(webp)return webp;
    if(opaque){
      // Widely supported on mobile. White mat is acceptable for reference
      // layouts, never for transparent real sticker material.
      ctx.globalCompositeOperation='destination-over';
      ctx.fillStyle='#fff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.globalCompositeOperation='source-over';
      for(const size of [maxEdge,640,512]){
        if(size!==maxEdge){
          draw(size);ctx.globalCompositeOperation='destination-over';
          ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.globalCompositeOperation='source-over';
        }
        const jpeg=await matchingBytes(await serialize(canvas,'image/jpeg',quality),'jpg');
        if(jpeg)return jpeg;
      }
    }
    // Universal lossless fallback. Scale progressively to keep photo tasks
    // manageable; never strip material transparency or lie about file type.
    const levels=[maxEdge,384,320,256,192].filter((v,i,all)=>v<=maxEdge&&all.indexOf(v)===i);
    let png=null;
    for(const size of levels){
      draw(size);
      png=await matchingBytes(await serialize(canvas,'image/png'),'png');
      if(!png)throw Error('当前浏览器无法编码 PNG 预览');
      if(png.byteLength<=maxBytes)break;
    }
    return png;
  }finally{bitmap.close?.();}
}

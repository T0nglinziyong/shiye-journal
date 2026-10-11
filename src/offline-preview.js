// GPT handoff images are visual guidance, NEVER replacement for the original
// high-resolution material stored in the user's local/cloud library.
// Material: max 512px; journal examples/templates: max 768px.
// WebP lossy colors, alpha preserved by browser WebP encoder; verify MIME and
// RIFF header instead of silently writing PNG bytes with a .webp suffix.
export const OFFLINE_MATERIAL_EDGE=512;
export const OFFLINE_REFERENCE_EDGE=768;
export const OFFLINE_IMAGE_QUALITY=.86;
export function isWebpBytes(bytes){
  return bytes?.length>=12&&
    String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&
    String.fromCharCode(...bytes.subarray(8,12))==='WEBP';
}
export async function offlinePreviewBytes(blob,{maxEdge=OFFLINE_MATERIAL_EDGE,quality=OFFLINE_IMAGE_QUALITY}={}){
  if(!(blob instanceof Blob)||!blob.size)throw Error('创作素材预览文件无效');
  const bitmap=await createImageBitmap(blob),
    canvas=document.createElement('canvas');
  try{
    const scale=Math.min(1,maxEdge/Math.max(bitmap.width,bitmap.height));
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('无法生成素材预览');
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const output=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
    if(!output||output.type!=='image/webp')throw Error('当前浏览器不支持 WebP 创作预览编码');
    const bytes=new Uint8Array(await output.arrayBuffer());
    if(!isWebpBytes(bytes))throw Error('WebP 创作预览内容格式错误');
    return bytes;
  }finally{bitmap.close?.();}
}

import {gzipSync,gunzipSync} from 'fflate';
import {decodeImageBlob} from './image-blob-decoder.js';

// Canonical single-channel alpha, not a second RGB PNG. The accepted final
// cutout and mask refer to exactly the same raster extent before rotation.
const MAGIC=[83,72,77,49]; // "SHM1"
const LIMIT=32_000_000;
export function encodeAlphaMask(alpha,width,height){
 if(!(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&
   width*height<=LIMIT&&alpha?.length===width*height))
   throw Error('蒙版尺寸或字节数不合法');
 const buffer=new Uint8Array(12+alpha.length),view=new DataView(buffer.buffer);
 buffer.set(MAGIC);view.setUint32(4,width,true);view.setUint32(8,height,true);
 buffer.set(alpha,12);
 return new Blob([gzipSync(buffer,{level:4})],{type:'application/gzip'});
}
export async function readAlphaMask(blob){
 if(!(blob instanceof Blob)||!blob.size)throw Error('缺少透明蒙版');
 const bytes=gunzipSync(new Uint8Array(await blob.arrayBuffer()));
 if(bytes.length<13||MAGIC.some((value,i)=>value!==bytes[i]))throw Error('透明蒙版格式无效');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),
  width=view.getUint32(4,true),height=view.getUint32(8,true);
 if(!width||!height||width*height>LIMIT||bytes.length!==12+width*height)
   throw Error('蒙版尺寸不匹配或数据损坏');
 return {width,height,alpha:Uint8ClampedArray.from(bytes.subarray(12))};
}
export async function extractAlphaMask(imageBlob){
 const image=await decodeImageBlob(imageBlob);
 try{
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,
    alpha=new Uint8ClampedArray(canvas.width*canvas.height);
  for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
  return encodeAlphaMask(alpha,canvas.width,canvas.height);
 }finally{image.close?.();}
}

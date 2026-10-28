import {decodeImageBlob} from './image-blob-decoder.js';

// A4's physical aspect ratio differs from 1080:1440. Use 1440 as its long-edge
// tier, round other physical sizes up to a small set of tiers, and retain the
// source raster's aspect ratio.
export const A4_STORAGE_WIDTH=1080;
export const A4_STORAGE_HEIGHT=1440;
const A4_WIDTH_MM=210;
const A4_HEIGHT_MM=297;
const PIXELS_PER_MM=Math.min(A4_STORAGE_WIDTH/A4_WIDTH_MM,A4_STORAGE_HEIGHT/A4_HEIGHT_MM);
export const MATERIAL_LONG_EDGE_TIERS=[256,384,512,768,1080,1440];

function longEdgeTier(target){
  return MATERIAL_LONG_EDGE_TIERS.find(tier=>tier>=target)||MATERIAL_LONG_EDGE_TIERS.at(-1);
}

export function materialStorageSize(width,height,physicalWidthMM,physicalHeightMM){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
    throw Error('素材像素尺寸无效');
  const measured=Number.isFinite(physicalWidthMM)&&physicalWidthMM>0&&
    Number.isFinite(physicalHeightMM)&&physicalHeightMM>0;
  const target=measured?Math.max(physicalWidthMM,physicalHeightMM)*PIXELS_PER_MM:A4_STORAGE_HEIGHT;
  const scale=Math.min(1,longEdgeTier(target)/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}

async function resizePNG(blob,physicalWidthMM,physicalHeightMM){
  const bitmap=await decodeImageBlob(blob);
  try{
    const size=materialStorageSize(bitmap.width,bitmap.height,physicalWidthMM,physicalHeightMM);
    if(size.width===bitmap.width&&size.height===bitmap.height)return blob;
    const canvas=document.createElement('canvas');
    canvas.width=size.width;canvas.height=size.height;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('无法准备素材保存画布');
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(bitmap,0,0,size.width,size.height);
    return await new Promise((resolve,reject)=>canvas.toBlob(
      data=>data?.size?resolve(data):reject(Error('素材缩图失败')),'image/png'));
  }finally{bitmap.close?.();}
}

export async function materialStorageBlobs(cutout,frame,physicalWidthMM,physicalHeightMM){
  if(!(cutout instanceof Blob)||!(frame instanceof Blob))throw Error('素材抠图或候选框未准备好');
  if(cutout===frame){
    const image=await resizePNG(cutout,physicalWidthMM,physicalHeightMM);
    return {cutout:image,frame:image};
  }
  const image=await resizePNG(cutout,physicalWidthMM,physicalHeightMM);
  const source=await resizePNG(frame,physicalWidthMM,physicalHeightMM);
  return {cutout:image,frame:source};
}

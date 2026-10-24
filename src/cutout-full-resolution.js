import {decodeImageBlob} from './image-blob-decoder.js';
import {readAlphaMask} from './alpha-mask-blob.js';
import {scaleFramePlacement} from './cutout-edit-resolution.js';

const MAX_PIXELS=32_000_000;
const asPNG=canvas=>new Promise((resolve,reject)=>
  canvas.toBlob(blob=>blob?.size?resolve(blob):reject(Error('高清抠图导出失败')),'image/png'));

export function fullResolutionPlacement(processing,frameWidth,frameHeight){
 const meta=processing?.candidateFramePlacement;
 return scaleFramePlacement(meta,meta?.frameWidth||frameWidth,meta?.frameHeight||frameHeight,
   frameWidth,frameHeight);
}
// No high resolution alpha byte buffer ever crosses the network. The mask
// remains a small one-channel Blob; its coordinates are projected onto the
// same corrected, aligned source frame used by the import extractor.
export async function renderHighResolutionCutout(candidateRGB,editorMask,processing={}){
 const image=await decodeImageBlob(candidateRGB);
 try{
   const mask=await readAlphaMask(editorMask),p=fullResolutionPlacement(processing,image.width,image.height);
   if(!(p.x>=-.5&&p.y>=-.5&&p.x+p.width<=image.width+1&&
     p.y+p.height<=image.height+1&&p.width>0&&p.height>0))
     throw Error('候选框源坐标无效，已停止高清合成');
   const width=Math.max(1,Math.round(p.width)),height=Math.max(1,Math.round(p.height));
   if(width*height>MAX_PIXELS)throw Error('高清候选框超过浏览器单次处理预算，原素材未被覆盖');
   const sheet=document.createElement('canvas');sheet.width=width;sheet.height=height;
   const ctx=sheet.getContext('2d',{willReadFrequently:processing.appearance!=='original'});
   if(!ctx)throw Error('高清画布初始化失败');
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.drawImage(image,p.x,p.y,p.width,p.height,0,0,width,height);
   const style=processing.appearance||'original',intensity=processing.intensity??.5;
   if(style!=='original'){
     const data=ctx.getImageData(0,0,width,height),rgba=data.data;
     for(let i=0;i<rgba.length;i+=4){
       const lum=.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2];
       for(let channel=0;channel<3;channel++){
         let value=rgba[i+channel];
         if(style==='natural')value+=intensity*14*(1-lum/255);
         else value=(value-lum)*(1+.3*intensity)+lum+(lum-128)*.18*intensity;
         rgba[i+channel]=Math.max(0,Math.min(255,value));
       }
     }
     ctx.putImageData(data,0,0);
   }
   // Construct an alpha-only small canvas then let the browser project it
   // to the high-resolution source crop, including antialiasing at edges.
   const low=document.createElement('canvas');low.width=mask.width;low.height=mask.height;
   const mx=low.getContext('2d'),rgba=mx.createImageData(mask.width,mask.height);
   for(let i=0;i<mask.alpha.length;i++){
     const k=i*4;rgba.data[k]=rgba.data[k+1]=rgba.data[k+2]=255;
     rgba.data[k+3]=mask.alpha[i];
   }
   mx.putImageData(rgba,0,0);
   ctx.save();ctx.globalCompositeOperation='destination-in';
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.drawImage(low,0,0,width,height);ctx.restore();
   let output=sheet;
   const angle=Number(processing.displayRotationDegrees)||0;
   if(Math.abs(angle)>1e-8){
     const rad=angle*Math.PI/180,rotated=document.createElement('canvas');
     rotated.width=Math.ceil(Math.abs(width*Math.cos(rad))+Math.abs(height*Math.sin(rad)));
     rotated.height=Math.ceil(Math.abs(height*Math.cos(rad))+Math.abs(width*Math.sin(rad)));
     if(rotated.width*rotated.height>MAX_PIXELS)throw Error('高清旋转超出安全像素预算');
     const rc=rotated.getContext('2d');
     rc.translate(rotated.width/2,rotated.height/2);
     rc.rotate(rad);rc.drawImage(sheet,-width/2,-height/2);
     output=rotated;
   }
   return await asPNG(output);
 }finally{image.close?.();}
}

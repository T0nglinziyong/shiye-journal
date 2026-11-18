import {decodeImageBlob} from './image-blob-decoder.js';

export function wrapDisplayRotation(value){
  const angle=Number(value);
  if(!Number.isFinite(angle))throw Error('显示角度必须是数字');
  return Math.round(((((angle+180)%360)+360)%360-180)*10)/10;
}

export function rotatedPhysicalSize(width,height,angle){
  const w=Number(width),h=Number(height),r=Number(angle)*Math.PI/180;
  if(!(w>0&&h>0&&Number.isFinite(r)))return null;
  return {width:Math.round((Math.abs(w*Math.cos(r))+Math.abs(h*Math.sin(r)))*10)/10,
    height:Math.round((Math.abs(h*Math.cos(r))+Math.abs(w*Math.sin(r)))*10)/10};
}

export function acceptedOrientationDelta(value){
  if(!value||![-90,0,90,180].includes(value.deltaDegrees)||
    !Number.isFinite(value.confidence)||value.confidence<.85||value.confidence>1)return null;
  return value.deltaDegrees;
}

export async function rotateMaterialPNG(blob,delta){
  const image=await decodeImageBlob(blob);
  try{
    const angle=wrapDisplayRotation(delta)*Math.PI/180;
    const width=Math.max(1,Math.ceil(Math.abs(image.width*Math.cos(angle))+Math.abs(image.height*Math.sin(angle))-1e-7)),
      height=Math.max(1,Math.ceil(Math.abs(image.height*Math.cos(angle))+Math.abs(image.width*Math.sin(angle))-1e-7));
    if(width*height>32_000_000)throw Error('旋转后的素材超过浏览器处理范围');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('无法准备素材旋转画布');
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.translate(width/2,height/2);ctx.rotate(angle);
    ctx.drawImage(image,-image.width/2,-image.height/2);
    return await new Promise((resolve,reject)=>canvas.toBlob(
      output=>output?.size?resolve(output):reject(Error('素材旋转导出失败')),'image/png'));
  }finally{image.close?.();}
}

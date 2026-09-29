// Projective rectification runs entirely on the user's device. Coordinates are
// normalized against the original bitmap; output uses the A4 aspect ratio.
import {visionTask} from './vision-runtime.js';
export function validateCorners(c){
  if(!Array.isArray(c)||c.length!==4||c.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))throw Error('四角需位于照片内');
  const area=Math.abs(c.reduce((sum,p,i)=>sum+p.x*c[(i+1)%4].y-p.y*c[(i+1)%4].x,0))/2;
  for(let i=0;i<4;i++){const a=c[i],b=c[(i+1)%4],d=c[(i+2)%4];if((b.x-a.x)*(d.y-b.y)-(b.y-a.y)*(d.x-b.x)<=.00001)throw Error('四角不能交叉，请按顺时针调整');}
  if(area<.03)throw Error('纸张四角区域太小');
  return c;
}
export async function rectifyA4(bitmap,corners,maxDimension=4096,paperRatio=210/297){
  validateCorners(corners);
  const p=corners.map(v=>({x:v.x*bitmap.width,y:v.y*bitmap.height}));
  const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const rawWidth=(length(p[0],p[1])+length(p[3],p[2]))/2;
  const rawHeight=(length(p[0],p[3])+length(p[1],p[2]))/2;
  if(!Number.isFinite(paperRatio)||paperRatio<=0)throw Error('纸张比例无效');
  const size=Math.min(maxDimension,Math.max(300,Math.round(Math.max(rawWidth,rawHeight))));
  const height=Math.round(size/Math.max(1,paperRatio)),width=Math.round(height*paperRatio);
  const source=document.createElement('canvas');source.width=bitmap.width;source.height=bitmap.height;
  const sourceCtx=source.getContext('2d',{willReadFrequently:true});sourceCtx.drawImage(bitmap,0,0);
  const src=sourceCtx.getImageData(0,0,source.width,source.height).data;
  const result=document.createElement('canvas');result.width=width;result.height=height;
  const processed=await visionTask('warp',{pixels:src,transferInput:true,sourceWidth:bitmap.width,sourceHeight:bitmap.height,corners,width,height});
  const ctx=result.getContext('2d');const frame=new ImageData(processed.pixels,width,height);
  ctx.putImageData(frame,0,0);
  return new Promise((resolve,reject)=>result.toBlob(blob=>blob?resolve(blob):reject(Error('校正图像失败')),'image/png'));
}
export async function suggestPaperCorners(bitmap,paperRatio=210/297){
  const ratio=Math.min(1,800/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*ratio)),h=Math.max(1,Math.round(bitmap.height*ratio));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,w,h);
  return visionTask('quad',{pixels:ctx.getImageData(0,0,w,h).data,width:w,height:h,paperRatio});
}

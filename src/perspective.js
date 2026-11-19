// Projective rectification runs entirely on the user's device. Coordinates are
// normalized against the original bitmap; output uses the A4 aspect ratio.
import {visionTask} from './vision-runtime.js';
import {analysisPixels,pixelCanvas,sourcePixels} from './recognition-raster.js';
export function validateCorners(c){
  if(!Array.isArray(c)||c.length!==4||c.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))throw Error('四角需位于照片内');
  const area=Math.abs(c.reduce((sum,p,i)=>sum+p.x*c[(i+1)%4].y-p.y*c[(i+1)%4].x,0))/2;
  for(let i=0;i<4;i++){const a=c[i],b=c[(i+1)%4],d=c[(i+2)%4];if((b.x-a.x)*(d.y-b.y)-(b.y-a.y)*(d.x-b.x)<=.00001)throw Error('四角不能交叉，请按顺时针调整');}
  if(area<.03)throw Error('纸张四角区域太小');
  return c;
}
export function rectifiedPixelSize(rawWidth,rawHeight,maxDimension=4096,paperRatio=210/297){
  if(!Number.isFinite(rawWidth)||!Number.isFinite(rawHeight)||rawWidth<=0||rawHeight<=0||
     !Number.isFinite(maxDimension)||maxDimension<300||!Number.isFinite(paperRatio)||paperRatio<=0)
    throw Error('矫正尺寸或纸张比例无效');
  const longest=Math.min(maxDimension,Math.max(300,Math.round(Math.max(rawWidth,rawHeight))));
  const width=paperRatio>=1?longest:Math.max(1,Math.round(longest*paperRatio));
  const height=paperRatio<1?longest:Math.max(1,Math.round(longest/paperRatio));
  return {width,height};
}
export async function rectifyA4Frame(bitmap,corners,maxDimension=4096,paperRatio=210/297){
  validateCorners(corners);
  const p=corners.map(v=>({x:v.x*bitmap.width,y:v.y*bitmap.height}));
  const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const rawWidth=(length(p[0],p[1])+length(p[3],p[2]))/2;
  const rawHeight=(length(p[0],p[3])+length(p[1],p[2]))/2;
  if(!Number.isFinite(paperRatio)||paperRatio<=0)throw Error('纸张比例无效');
  const {width,height}=rectifiedPixelSize(rawWidth,rawHeight,maxDimension,paperRatio);
  const processed=await visionTask('warp',{pixels:sourcePixels(bitmap),transferInput:true,sourceWidth:bitmap.width,sourceHeight:bitmap.height,corners,width,height});
  const canvas=pixelCanvas(processed.pixels,width,height);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('校正图像失败')),'image/png'));
  return {canvas,blob};
}
export async function rectifyA4(bitmap,corners,maxDimension=4096,paperRatio=210/297){
  return (await rectifyA4Frame(bitmap,corners,maxDimension,paperRatio)).blob;
}
export async function suggestPaperCorners(bitmap,paperRatio=210/297){
  const ratio=Math.min(1,800/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*ratio)),h=Math.max(1,Math.round(bitmap.height*ratio));
  const pixels=await analysisPixels(bitmap,{x:0,y:0,w:1,h:1},w,h);
  const corners=await visionTask('quad',{pixels,width:w,height:h,paperRatio});
  return corners?refinePaperHorizontalBorders(pixels,w,h,corners):null;
}

export function refinePaperHorizontalBorders(pixels,width,height,corners){
  const result=corners.map(point=>({...point}));
  const brightness=(x,y)=>{
    const ix=Math.round(x),iy=Math.round(y);
    if(ix<0||iy<0||ix>=width||iy>=height)return null;
    const at=(iy*width+ix)*4;
    return (pixels[at]*77+pixels[at+1]*150+pixels[at+2]*29)/256;
  };
  for(const side of [0,2]){
    const a=corners[side],b=corners[(side+1)%4];
    const vx=(b.x-a.x)*width,vy=(b.y-a.y)*height;
    const length=Math.hypot(vx,vy);
    if(length<width*.25)continue;
    const nx=-vy/length,ny=vx/length,observations=[];
    for(let index=0;index<30;index++){
      const t=.12+.76*index/29,x=(a.x+(b.x-a.x)*t)*width,y=(a.y+(b.y-a.y)*t)*height;
      const outside=brightness(x-28*nx,y-28*ny);
      if(outside===null)continue;
      for(let offset=-22;offset<=22;offset++){
        const before=brightness(x+(offset-3)*nx,y+(offset-3)*ny);
        const after=brightness(x+(offset+3)*nx,y+(offset+3)*ny);
        const deeper=brightness(x+(offset+10)*nx,y+(offset+10)*ny);
        if(before===null||after===null||deeper===null)continue;
        if(Math.min(after,deeper)>outside+25&&after-before>18){
          observations.push({t,offset});break;
        }
      }
    }
    if(observations.length<24)continue;
    const values=observations.map(item=>item.offset).sort((x,y)=>x-y);
    if(values[Math.floor(values.length*.9)]-values[Math.floor(values.length*.1)]>11)continue;
    const meanT=observations.reduce((sum,item)=>sum+item.t,0)/observations.length;
    const meanOffset=observations.reduce((sum,item)=>sum+item.offset,0)/observations.length;
    const numerator=observations.reduce((sum,item)=>sum+(item.t-meanT)*(item.offset-meanOffset),0);
    const denominator=observations.reduce((sum,item)=>sum+(item.t-meanT)**2,0);
    const slope=denominator?numerator/denominator:0;
    const shifts=[0,1].map(t=>Math.max(-18,Math.min(18,meanOffset+slope*(t-meanT)+1.5)));
    if(Math.abs(shifts[0]-shifts[1])<6)continue;
    for(const [index,t] of [[side,0],[(side+1)%4,1]]){
      const shift=shifts[t];
      result[index].x=Math.max(0,Math.min(1,result[index].x+shift*nx/width));
      result[index].y=Math.max(0,Math.min(1,result[index].y+shift*ny/height));
    }
  }
  return result;
}

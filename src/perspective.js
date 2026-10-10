// Projective rectification runs entirely on the user's device. Coordinates are
// normalized against the original bitmap; output uses the A4 aspect ratio.
import {visionTask} from './vision-runtime.js';
import {analysisPixels,pixelCanvas,sourcePixels} from './recognition-raster.js';
export const PAPER_DETECTION_LONG_EDGE=800;
export function validateCorners(c){
  if(!Array.isArray(c)||c.length!==4||c.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))throw Error('四角需位于照片内');
  const area=Math.abs(c.reduce((sum,p,i)=>sum+p.x*c[(i+1)%4].y-p.y*c[(i+1)%4].x,0))/2;
  for(let i=0;i<4;i++){const a=c[i],b=c[(i+1)%4],d=c[(i+2)%4];if((b.x-a.x)*(d.y-b.y)-(b.y-a.y)*(d.x-b.x)<=.00001)throw Error('四角不能交叉，请按顺时针调整');}
  if(area<.03)throw Error('纸张四角区域太小');
  return c;
}
export async function rectifyA4Frame(bitmap,corners,maxDimension=4096,paperRatio=210/297){
  validateCorners(corners);
  const p=corners.map(v=>({x:v.x*bitmap.width,y:v.y*bitmap.height}));
  const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const rawWidth=(length(p[0],p[1])+length(p[3],p[2]))/2;
  const rawHeight=(length(p[0],p[3])+length(p[1],p[2]))/2;
  if(!Number.isFinite(paperRatio)||paperRatio<=0)throw Error('纸张比例无效');
  const size=Math.min(maxDimension,Math.max(300,Math.round(Math.max(rawWidth,rawHeight))));
  const height=Math.round(size/Math.max(1,paperRatio)),width=Math.round(height*paperRatio);
  const processed=await visionTask('warp',{pixels:sourcePixels(bitmap),transferInput:true,sourceWidth:bitmap.width,sourceHeight:bitmap.height,corners,width,height});
  const canvas=pixelCanvas(processed.pixels,width,height);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('校正图像失败')),'image/png'));
  return {canvas,blob};
}
export async function rectifyA4(bitmap,corners,maxDimension=4096,paperRatio=210/297){
  return (await rectifyA4Frame(bitmap,corners,maxDimension,paperRatio)).blob;
}
export async function suggestPaperCorners(bitmap,paperRatio=210/297,{onDiagnostic}={}){
  // Keep the same canonical 800px input and the same A4 algorithm.
  // Diagnostics are explicitly requested so OpenCV/WASM execution errors are
  // distinguishable from a valid 'no paper detected' result.
  const ratio=PAPER_DETECTION_LONG_EDGE/Math.max(bitmap.width,bitmap.height);
  const width=Math.max(1,Math.round(bitmap.width*ratio));
  const height=Math.max(1,Math.round(bitmap.height*ratio));
  try{
    const response=await visionTask('quad',{
      pixels:await analysisPixels(bitmap,{x:0,y:0,w:1,h:1},width,height),
      width,height,paperRatio,collectDiagnostics:true
    });
    const diagnostic=response?.diagnostics||{
      stage:'quad',inputSize:[width,height],accepted:Array.isArray(response)&&response.length===4
    };
    onDiagnostic?.(diagnostic);
    return Array.isArray(response)?response:response?.corners||null;
  }catch(error){
    onDiagnostic?.({stage:'quad-error',inputSize:[width,height],
      message:String(error?.message||error)});
    throw error;
  }
}

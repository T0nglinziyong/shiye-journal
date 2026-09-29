import {segmentPaperMaterials} from './paper-analysis.js';
// Analyze a small copy, but re-extract accepted cuts from the full source.
export async function detectPaperCandidates(bitmap,box,smallestMM=6,{balanceLight=false,paperWidthMM=210,paperHeightMM=297}={}){
  const ratio=Math.min(1,1000/Math.max(bitmap.width*box.w,bitmap.height*box.h));
  const w=Math.max(1,Math.round(bitmap.width*box.w*ratio)),h=Math.max(1,Math.round(bitmap.height*box.h*ratio));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(bitmap,bitmap.width*box.x,bitmap.height*box.y,bitmap.width*box.w,bitmap.height*box.h,0,0,w,h);
  return segmentPaperMaterials(ctx.getImageData(0,0,w,h),{smallestMM,paperWidthMM,paperHeightMM});
}
export async function cropBitmap(bitmap,paper,region,{raw=false}={}){
  const x=Math.max(0,Math.round(bitmap.width*(paper.x+region.x*paper.w))),y=Math.max(0,Math.round(bitmap.height*(paper.y+region.y*paper.h)));
  const w=Math.min(bitmap.width-x,Math.max(1,Math.round(bitmap.width*paper.w*region.w))),h=Math.min(bitmap.height-y,Math.max(1,Math.round(bitmap.height*paper.h*region.h)));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');
  if(region.rotation){ctx.translate(w/2,h/2);ctx.rotate(-region.rotation*Math.PI/180);ctx.drawImage(bitmap,-(x+w/2),-(y+h/2));ctx.resetTransform();}
  else ctx.drawImage(bitmap,x,y,w,h,0,0,w,h);
  if(region.mask&&!raw){
    const m=region.mask,mask=document.createElement('canvas');mask.width=m.width;mask.height=m.height;
    const mc=mask.getContext('2d'),frame=mc.createImageData(m.width,m.height);
    for(let i=0;i<m.alpha.length;i++){frame.data[i*4]=frame.data[i*4+1]=frame.data[i*4+2]=255;frame.data[i*4+3]=m.alpha[i];}
    mc.putImageData(frame,0,0);ctx.globalCompositeOperation='destination-in';ctx.imageSmoothingEnabled=true;ctx.drawImage(mask,0,0,w,h);ctx.globalCompositeOperation='source-over';
  }
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('素材裁图失败')),'image/png'));
}

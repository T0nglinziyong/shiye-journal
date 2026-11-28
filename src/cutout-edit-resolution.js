// Cutout inspection uses the same practical 900px analysis scale as material
// recognition. Full-resolution RGB and final PNG remain separately preserved.
export const CUTOUT_EDIT_EDGE=900;
export function fittedSize(width,height,edge=CUTOUT_EDIT_EDGE){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
   throw Error('抠图候选框尺寸无效');
 const scale=Math.min(1,edge/Math.max(width,height));
 return {width:Math.max(1,Math.round(width*scale)),
   height:Math.max(1,Math.round(height*scale))};
}
export function shrinkEditorBitmap(bitmap,edge=CUTOUT_EDIT_EDGE){
 const size=fittedSize(bitmap.width,bitmap.height,edge);
 if(bitmap.width===size.width&&bitmap.height===size.height)return bitmap;
 const canvas=document.createElement('canvas');
 canvas.width=size.width;canvas.height=size.height;
 const ctx=canvas.getContext('2d');
 if(!ctx)throw Error('无法准备低分辨率抠图画布');
 ctx.drawImage(bitmap,0,0,size.width,size.height);
 bitmap.close?.();
 return canvas;
}
export function resampleMask({width,height,alpha},targetWidth,targetHeight){
 if(!(Number.isInteger(targetWidth)&&Number.isInteger(targetHeight)
      &&targetWidth>0&&targetHeight>0&&targetWidth*targetHeight<=2_000_000))
   throw Error('编辑蒙版目标分辨率不合法');
 if(width===targetWidth&&height===targetHeight)return {width,height,alpha};
 const scaled=new Uint8ClampedArray(targetWidth*targetHeight);
 // Linear interpolation avoids the jagged edge that nearest-neighbour
 // downsampling would introduce. No full RGB image is ever loaded here.
 for(let y=0;y<targetHeight;y++){
   const sy=Math.max(0,Math.min(height-1,(y+.5)*height/targetHeight-.5)),
      y0=Math.floor(sy),y1=Math.min(height-1,y0+1),fy=sy-y0;
   for(let x=0;x<targetWidth;x++){
     const sx=Math.max(0,Math.min(width-1,(x+.5)*width/targetWidth-.5)),
       x0=Math.floor(sx),x1=Math.min(width-1,x0+1),fx=sx-x0;
     scaled[y*targetWidth+x]=Math.round(
       (alpha[y0*width+x0]*(1-fx)+alpha[y0*width+x1]*fx)*(1-fy)+
       (alpha[y1*width+x0]*(1-fx)+alpha[y1*width+x1]*fx)*fy);
   }
 }
 return {width:targetWidth,height:targetHeight,alpha:scaled};
}
export function scaleFramePlacement(meta,oldFrameWidth,oldFrameHeight,newFrameWidth,newFrameHeight){
 const original=meta&&meta.frameWidth>0&&meta.frameHeight>0&&meta.width>0&&meta.height>0
   ?meta:{x:0,y:0,width:oldFrameWidth,height:oldFrameHeight,
     frameWidth:oldFrameWidth,frameHeight:oldFrameHeight};
 const sx=newFrameWidth/original.frameWidth,sy=newFrameHeight/original.frameHeight;
 return {x:original.x*sx,y:original.y*sy,
   width:original.width*sx,height:original.height*sy,
   frameWidth:newFrameWidth,frameHeight:newFrameHeight};
}

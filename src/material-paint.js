// Shared source crop/mask projection for the canvas and used-piece thumbnails.
// Caller owns position/rotation/opacity; this paints only local material pixels.
import {clipMaterial} from './material-mask.js';
import {sceneLayerStyle,applyVectorMask} from './scene-model.js';
import {paintTapeStrip} from './tape-strip.js';
export function paintMaterialImage(ctx,item,image,{createCanvas}={}){
 const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
 if(!(w>0&&h>0))throw Error('素材图像尺寸无效');
 ctx.save();try{
  ctx.scale(item.isFlippedHorizontally?-1:1,1);
  const style=sceneLayerStyle(item);if(style.mask)applyVectorMask(ctx,style.mask,item.width,item.height);
  if(item.tapeStrip){paintTapeStrip(ctx,item,image,{createCanvas});return;}
  clipMaterial(ctx,item);
  const crop=item.cropRect||{x:0,y:0,width:1,height:1};
  ctx.drawImage(image,crop.x*w,crop.y*h,crop.width*w,crop.height*h,-item.width/2,-item.height/2,item.width,item.height);
 }finally{ctx.restore();}
}
export function materialPreviewKey(item){
 return JSON.stringify([item.sourceBlobId,item.sourceStaticPath,item.width,item.height,item.cropRect,item.materialMask,item.vectorMask,item.isFlippedHorizontally,item.tapeStrip,item.opacity]);
}
export function drawMaterialThumbnail(canvas,item,image,{width=180,height=144,padding=6}={}){
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('无法生成素材缩略图');
 const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,crop=item.cropRect||{width:1,height:1};
 const node={...item,width:item.width||iw*crop.width,height:item.height||ih*crop.height};
 if(!(node.width>0&&node.height>0))throw Error('素材显示尺寸无效');
 const scale=Math.min((width-padding*2)/node.width,(height-padding*2)/node.height);
 ctx.clearRect(0,0,width,height);ctx.save();try{
  ctx.translate(width/2,height/2);ctx.scale(scale,scale);ctx.globalAlpha=item.opacity??1;
  paintMaterialImage(ctx,node,image);
 }finally{ctx.restore();}
 return canvas;
}

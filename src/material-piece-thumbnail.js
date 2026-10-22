import {paintSceneMaterial} from './scene-material-painter.js';
// Source library cards show originals; used/standby cards show this exact Scene
// instance. No new material, source bytes, URL cache or inventory is created.
export function materialPieceSignature(item){
 return JSON.stringify([item?.id,item?.sourceBlobId,item?.sourceStaticPath,item?.width,item?.height,
  item?.cropRect,item?.materialMask,item?.vectorMask,item?.isFlippedHorizontally,item?.tapeStrip,item?.opacity]);
}
export function materialPieceSource(asset,item,source){
 if(item?.sourceBlobId)return source(item.sourceBlobId)||'';
 if(item?.sourceStaticPath)return item.sourceStaticPath;
 return asset&&(source(asset.blobId)||asset.staticPath)||'';
}
export function paintPieceThumbnail(ctx,item,image,width=144,height=112){
 const crop=item.cropRect||{width:1,height:1};
 const w=item.width||((image.naturalWidth||image.width)*crop.width),h=item.height||((image.naturalHeight||image.height)*crop.height);
 if(!(w>0&&h>0&&width>0&&height>0))throw Error('裁片缩略图尺寸无效');
 const fit=Math.min((width-4)/w,(height-4)/h);
 ctx.clearRect(0,0,width,height);ctx.save();
 try{ctx.translate(width/2,height/2);ctx.scale(fit,fit);ctx.globalAlpha=item.opacity??1;
  paintSceneMaterial(ctx,{...item,width:w,height:h},image);
 }finally{ctx.restore();}
 return {width:w*fit,height:h*fit};
}
export function mountPieceThumbnail(card,item){
 if(!item)return;
 const img=card.querySelector('img');if(!img)return;
 const canvas=document.createElement('canvas');canvas.className='material-piece-thumbnail';
 const dpr=Math.max(1,Math.min(2,globalThis.devicePixelRatio||1));canvas.width=144*dpr;canvas.height=112*dpr;
 canvas.setAttribute('aria-hidden','true');canvas.dataset.pieceId=item.id||'';
 const originalStyle=img.style.cssText;Object.assign(img.style,{position:'absolute',width:'1px',height:'1px',opacity:'0',pointerEvents:'none'});img.after(canvas);
 let disposed=false,frame;
 const fail=()=>{if(disposed)return;canvas.dataset.previewState='error';card.dataset.piecePreview='error';canvas.title='裁片预览暂不可用';};
 const paint=()=>{if(disposed||!canvas.isConnected||!img.naturalWidth||!img.naturalHeight||img.src.includes('#shiye-image='))return;
  try{const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
   paintPieceThumbnail(ctx,item,img,canvas.width,canvas.height);canvas.dataset.previewState='ready';card.dataset.piecePreview='ready';
  }catch{fail();}
 };
 // Listen through low->high resolution source updates; do not retain closures
 // after card disposal. A failed mask never silently shows the original cover.
 img.addEventListener('load',paint);img.addEventListener('error',fail);
 if(img.complete&&img.naturalWidth)frame=requestAnimationFrame(paint);
 return ()=>{disposed=true;cancelAnimationFrame(frame);img.removeEventListener('load',paint);img.removeEventListener('error',fail);canvas.remove();img.style.cssText=originalStyle;delete card.dataset.piecePreview;};
}

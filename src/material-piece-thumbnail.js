import {drawMaterialThumbnail} from './material-paint.js';
// Existing low-resolution image resource stays mounted so the private-image
// loader can replace its placeholder. No original-image fetch or cloud writes.
export function mountPieceThumbnail(card,item){
 if(!item)return;
 const img=card.querySelector('img');if(!img)return;
 const canvas=document.createElement('canvas');canvas.className='material-piece-thumbnail';
 canvas.setAttribute('aria-hidden','true');img.after(canvas);
 const before=img.style.visibility;img.style.visibility='hidden';
 card.dataset.piecePreview='pending';let disposed=false,frame;
 const paint=()=>{
  if(disposed||!canvas.isConnected||!img.complete||img.naturalWidth<=1||img.src.includes('#shiye-image='))return;
  try{drawMaterialThumbnail(canvas,item,img);card.dataset.piecePreview='ready';}
  catch{card.dataset.piecePreview='error';canvas.width=0;canvas.height=0;}
 };
 const schedule=()=>{if(disposed)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(paint);};
 const error=()=>{card.dataset.piecePreview='error';};
 const observer=new MutationObserver(schedule);observer.observe(img,{attributes:true,attributeFilter:['src']});
 img.addEventListener('load',schedule);img.addEventListener('error',error);schedule();
 return ()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();img.removeEventListener('load',schedule);img.removeEventListener('error',error);canvas.remove();img.style.visibility=before;delete card.dataset.piecePreview;};
}

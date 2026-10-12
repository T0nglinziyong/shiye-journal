import {materialMaskGeometry} from './material-mask.js';
// Build a visual derived thumbnail from the existing source photo. No new
// image record or COS object is created; the split parts share their assetID.
export function mountPieceThumbnail(card,item){
 if(!item||(item.cropRect==null&&item.materialMask==null))return;
 const img=card.querySelector('img');if(!img)return;
 const canvas=document.createElement('canvas');
 canvas.className='material-piece-thumbnail';canvas.width=144;canvas.height=112;
 canvas.setAttribute('aria-hidden','true');
 img.after(canvas);
 const paint=()=>{
   const w=img.naturalWidth,h=img.naturalHeight;
   if(!w||!h||!canvas.isConnected)return;
   const crop=item.cropRect||{x:0,y:0,width:1,height:1};
   const ctx=canvas.getContext('2d');
   if(!ctx)return;
   const scale=Math.min(canvas.width/(w*crop.width),canvas.height/(h*crop.height));
   const outW=w*crop.width*scale,outH=h*crop.height*scale;
   const left=(canvas.width-outW)/2,top=(canvas.height-outH)/2;
   ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();
   ctx.translate(left,top);
   const outline=materialMaskGeometry(item.materialMask);
   if(outline){
     ctx.beginPath();
     for(const ring of [outline.outer,...outline.holes]){
       ring.forEach(([x,y],i)=>i?ctx.lineTo(x*outW,y*outH):ctx.moveTo(x*outW,y*outH));
       ctx.closePath();
     }
     ctx.clip('evenodd');
   }
   ctx.drawImage(img,crop.x*w,crop.y*h,crop.width*w,crop.height*h,0,0,outW,outH);
   ctx.restore();img.style.display='none';
 };
 if(img.complete&&img.naturalWidth)paint();
 else{img.addEventListener('load',paint,{once:true});img.addEventListener('error',()=>canvas.remove(),{once:true});}
}

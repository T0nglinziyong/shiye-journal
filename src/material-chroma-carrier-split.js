// A coloured A4 sheet can have many separate printed spots; do NOT split it
// simply because raw Lab chroma is disconnected. Split a morphology-joined
// carrier only if two independently *large* raw components are present with
// a substantial background gap and distinct bounding boxes.
export function shouldSplitChromaCarrier(items,boxArea,pxPerMM){
 const viable=items.filter(c=>c.area>Math.max(600,boxArea*.075)&&
   Math.min(c.w,c.h)>pxPerMM*6).sort((a,b)=>b.area-a.area);
 if(viable.length!==2)return false;
 const [a,b]=viable;
 if(b.area/a.area<.13)return false;
 const gapX=Math.max(a.x-b.x-b.w,b.x-a.x-a.w,0),
   gapY=Math.max(a.y-b.y-b.h,b.y-a.y-a.h,0);
 if(Math.max(gapX,gapY)<pxPerMM*2)return false;
 // A connected green checker print is a paper, not two objects.
 return true;
}

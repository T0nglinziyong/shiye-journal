// A coloured A4 sheet can have many separate printed spots; do NOT split it
// simply because raw Lab chroma is disconnected. Split a morphology-joined
// carrier only if two independently *large* raw components are present with
// a substantial background gap and distinct bounding boxes.
export function shouldSplitChromaCarrier(items,boxArea,pxPerMM){
 const viable=items.filter(c=>c.area>Math.max(5000,boxArea*.075)&&
   c.w>=70&&c.h>=65&&Math.min(c.w,c.h)>pxPerMM*6)
   .sort((a,b)=>b.area-a.area);
 if(viable.length!==2)return false;
 const [a,b]=viable;
 if(b.area/a.area<.13)return false;
 const gapX=Math.max(a.x-b.x-b.w,b.x-a.x-a.w,0),
   gapY=Math.max(a.y-b.y-b.h,b.y-a.y-a.h,0);
 if(Math.max(gapX,gapY)<pxPerMM*2)return false;
 // A connected green checker print is a paper, not two objects.
 return true;
}

export function splitLabCarrierComponents(cv,rawThreshold,bbox,pxPerMM,emit){
 const crop=rawThreshold.roi(new cv.Rect(bbox.x,bbox.y,bbox.width,bbox.height)),
   labels=new cv.Mat(),stats=new cv.Mat(),centroids=new cv.Mat();
 try{
   const count=cv.connectedComponentsWithStats(crop,labels,stats,centroids,8,cv.CV_32S),
     parts=[];
   for(let label=1;label<count;label++){
     const offset=label*5,x=stats.data32S[offset],
       y=stats.data32S[offset+1],w=stats.data32S[offset+2],
       h=stats.data32S[offset+3],area=stats.data32S[offset+4];
     if(area>Math.max(5000,bbox.width*bbox.height*.075)&&
       w>=70&&h>=65&&Math.min(w,h)>pxPerMM*6)
       parts.push({label,x,y,w,h,area});
   }
   if(!shouldSplitChromaCarrier(parts,bbox.width*bbox.height,pxPerMM))
     return false;
   const selected=parts.sort((a,b)=>b.area-a.area);
   for(const part of selected){
     const island=cv.Mat.zeros(bbox.height,bbox.width,cv.CV_8UC1),
       contours=new cv.MatVector(),hierarchy=new cv.Mat();
     try{
       for(let k=0;k<island.data.length;k++)
         if(labels.data32S[k]===part.label)island.data[k]=255;
       // Close holes in ink/patterns without bridging two objects.
       cv.findContours(island,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
       let best=null,max=0;
       for(let i=0;i<contours.size();i++){
         const contour=contours.get(i),a=Math.abs(cv.contourArea(contour));
         if(a>max){best?.delete();best=contour;max=a;}else contour.delete();
       }
       if(!best)continue;
       try{
         const hull=new cv.Mat();
         try{
           cv.convexHull(best,hull,false,true);
           const data=Array.from({length:hull.rows},(_,i)=>[
             hull.data32S[i*2]+bbox.x,hull.data32S[i*2+1]+bbox.y]).flat(),
             global=cv.matFromArray(hull.rows,1,cv.CV_32SC2,data);
           try{emit(global,part.area);}
           finally{global.delete();}
         }finally{hull.delete();}
       }finally{best.delete();}
     }finally{hierarchy.delete();contours.delete();island.delete();}
   }
   return true;
 }finally{centroids.delete();stats.delete();labels.delete();crop.delete();}
}

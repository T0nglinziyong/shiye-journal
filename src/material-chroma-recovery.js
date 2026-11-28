// Re-acquire the external carrier boundary only for a demonstrably broken
// Canny polygon. This uses the SAME OpenCV.js runtime and the SAME page pixels
// as the app. It never runs a separate Python/AI segmentation engine.
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)]||0;
const intersection=(a,b)=>{
 const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);
 return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-x)*
   Math.max(0,Math.min(a.y+a.h,b.y+b.h)-y);
};
export function chromaRecoveryCandidateFits(candidate,object){
 const inter=intersection(candidate,object),
   iou=inter/Math.max(1,candidate.w*candidate.h+object.w*object.h-inter),
   maxTravel=Math.max(candidate.w,candidate.h)*.45,
   outwardExtent=Math.max(0,candidate.x-object.x,object.x+object.w-candidate.x-candidate.w,
     candidate.y-object.y,object.y+object.h-candidate.y-candidate.h);
 return iou>.48&&outwardExtent<=maxTravel&&object.area>candidate.w*candidate.h*.22;
}
export function recoverBrokenPhysicalChroma(cv,p,box){
 const w=p.width,h=p.height,roi={
   x:Math.floor(box.x*w),y:Math.floor(box.y*h),
   w:Math.ceil(box.w*w),h:Math.ceil(box.h*h)
 };
 if(roi.w<40||roi.h<40)return null;
 const rgba=cv.matFromArray(h,w,cv.CV_8UC4,p.pixels),
   rgb=new cv.Mat(),lab=new cv.Mat(),binary=new cv.Mat(),
   labels=new cv.Mat(),stats=new cv.Mat(),centroids=new cv.Mat();
 try{
   cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);
   const a=[],b=[],d=lab.data;
   for(const [top,bottom] of [[.025,.075],[.925,.975]])
     for(let y=Math.round(h*top);y<h*bottom;y+=3)
       for(let x=Math.round(w*.08);x<w*.92;x+=3){
         const at=(y*w+x)*3;a.push(d[at+1]);b.push(d[at+2]);
       }
   const refA=median(a),refB=median(b),
     chroma=new Uint8Array(w*h);
   for(let i=0;i<w*h;i++){
     const at=i*3,dA=d[at+1]-refA,dB=d[at+2]-refB;
     chroma[i]=Math.hypot(dA,dB)>11?255:0;
   }
   const mask=cv.matFromArray(h,w,cv.CV_8UC1,chroma);
   try{mask.copyTo(binary);}finally{mask.delete();}
   const n=cv.connectedComponentsWithStats(binary,labels,stats,centroids,8,cv.CV_32S),
     choices=[];
   for(let id=1;id<n;id++){
     const j=id*5,item={id,x:stats.data32S[j],y:stats.data32S[j+1],
       w:stats.data32S[j+2],h:stats.data32S[j+3],area:stats.data32S[j+4]};
     if(chromaRecoveryCandidateFits(roi,item))choices.push({
       ...item,overlap:intersection(roi,item)
     });
   }
   choices.sort((a,b)=>b.overlap-a.overlap);
   if(!choices.length)return null;
   const chosen=choices[0],
     island=cv.Mat.zeros(h,w,cv.CV_8UC1),
     contours=new cv.MatVector(),hierarchy=new cv.Mat();
   try{
     for(let i=0;i<w*h;i++)if(labels.data32S[i]===chosen.id)
       island.data[i]=255;
     cv.findContours(island,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
     let best=null,max=0;
     for(let i=0;i<contours.size();i++){
       const c=contours.get(i),size=Math.abs(cv.contourArea(c));
       if(size>max){best?.delete();best=c;max=size;}else c.delete();
     }
     if(!best)return null;
     try{
       const hull=new cv.Mat(),poly=new cv.Mat();
       try{
         cv.convexHull(best,hull,false,true);
         cv.approxPolyDP(hull,poly,Math.max(1,cv.arcLength(hull,true)*.012),true);
         if(poly.rows<3||max<roi.w*roi.h*.20)return null;
         return Array.from({length:poly.rows},(_,i)=>[
           clamp(poly.data32S[i*2]/w,0,1),
           clamp(poly.data32S[i*2+1]/h,0,1)
         ]);
       }finally{poly.delete();hull.delete();}
     }finally{best.delete();}
   }finally{hierarchy.delete();contours.delete();island.delete();}
 }finally{
   centroids.delete();stats.delete();labels.delete();
   binary.delete();lab.delete();rgb.delete();rgba.delete();
 }
}

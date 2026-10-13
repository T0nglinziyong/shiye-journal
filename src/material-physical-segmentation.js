import {segmentMaterialBoxes} from './material-segmentation.js';
import {orientedContourBox} from './material-orientation.js';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));

// This is boundary evidence, NOT probability of a correct mask. No shape
// labels/class IDs enter the decision; provisional threshold is deliberately
// conservative until pixel-level ground truth is available.
export function createBoundaryConfidenceContext(cv,p){
 const width=p.width,height=p.height,
   src=cv.matFromArray(height,width,cv.CV_8UC4,p.pixels),
   gray=new cv.Mat(),maps=[];
 cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
 for(const [lo,hi] of [[10,30],[20,60],[40,120]]){
   const m=new cv.Mat();cv.Canny(gray,m,lo,hi);maps.push(m);
 }
 const evaluate=region=>{
   const poly=region?.physicalBoundary;
   if(!Array.isArray(poly)||poly.length<3)return {score:0,edge:0,continuity:0,contrast:0,stability:0,reason:'no-physical-contour'};
   let total=0,edges=[0,0,0],contrasts=0,gradients=0,weak=0,maxWeak=0,area=0;
   const indices=poly.map(([x,y])=>[x*width,y*height]);
   for(let j=0;j<indices.length;j++){
     const [x,y]=indices[j],next=indices[(j+1)%indices.length];
     area+=x*next[1]-next[0]*y;
   }
   // Each physical arc contributes proportionally to its length, not the
   // number of vertices emitted by approxPolyDP.
   const perimeter=indices.reduce((sum,a,i)=>{
     const b=indices[(i+1)%indices.length];return sum+Math.hypot(a[0]-b[0],a[1]-b[1]);
   },0);
   const sampleCount=clamp(Math.round(perimeter/3),64,384);
   let seg=0,covered=0;
   for(let i=0;i<indices.length;i++){
     const a=indices[i],b=indices[(i+1)%indices.length];
     const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
     if(length<.01)continue;
     const count=Math.max(1,Math.round(sampleCount*length/perimeter));
     const nx=(b[1]-a[1])/length,ny=-(b[0]-a[0])/length;
     for(let t=0;t<count;t++){
       const x=Math.round(a[0]+(b[0]-a[0])*(t+.5)/count),
         y=Math.round(a[1]+(b[1]-a[1])*(t+.5)/count);
       if(x<3||y<3||x>=width-3||y>=height-3)continue;
       total++;
       let hits=0;
       for(let k=0;k<maps.length;k++){
         let found=false;
         for(let dy=-2;dy<=2&&!found;dy++)for(let dx=-2;dx<=2;dx++){
           if(maps[k].data[(y+dy)*width+x+dx]){found=true;break;}
         }
         if(found){edges[k]++;hits++;}
       }
       if(hits){covered++;weak=0;}else maxWeak=Math.max(maxWeak,++weak);
       const iy=clamp(Math.round(y+ny*3),0,height-1),
         ix=clamp(Math.round(x+nx*3),0,width-1),
         oy=clamp(Math.round(y-ny*3),0,height-1),
         ox=clamp(Math.round(x-nx*3),0,width-1);
       const difference=Math.abs(gray.data[iy*width+ix]-gray.data[oy*width+ox]);
       contrasts+=Math.min(1,difference/26);
       gradients+=Math.min(1,difference/45);
     }
   }
   if(total<10)return {score:0,edge:0,continuity:0,contrast:0,stability:0,reason:'too-few-supported-samples'};
   const occupancies=edges.map(v=>v/total),edge=.5*occupancies[0]+.3*occupancies[1]+.2*occupancies[2],
     stability=occupancies.filter(v=>v>.43).length/3,
     continuity=clamp(1-maxWeak/total,0,1),
     contrast=contrasts/total,gradient=gradients/total,
     fill=clamp(Math.abs(area)/Math.max(1,region.w*width*region.h*height),0,1),
     clipping=1-covered/Math.max(1,total);
   const score=clamp(.29*edge+.19*gradient+.19*contrast+.14*continuity+
     .11*stability+.08*clamp(fill/.55,0,1)-.12*Math.max(0,clipping-.7),0,1);
   return {score,edge,contrast,gradient,continuity,stability,fill,samples:total};
 };
 return {evaluate,close(){for(const m of maps)m.delete();gray.delete();src.delete();}};
}
export function boundaryConfidence(cv,p,region){
 const ctx=createBoundaryConfidenceContext(cv,p);
 try{return ctx.evaluate(region);}finally{ctx.close();}
}

function physicalRegion(cv,p,box){
 const w=p.width,h=p.height;
 const points=box.physicalBoundary||[
   [box.x,box.y],[box.x+box.w,box.y],
   [box.x+box.w,box.y+box.h],[box.x,box.y+box.h]
 ];
 if(!points||points.length<3)return null;
 // Rasterize at the SAME pixel scale as the original morph segmenter.
 const ax=clamp(Math.floor(Math.min(...points.map(v=>v[0]))*w)-2,0,w-1),
   ay=clamp(Math.floor(Math.min(...points.map(v=>v[1]))*h)-2,0,h-1),
   bx=clamp(Math.ceil(Math.max(...points.map(v=>v[0]))*w)+3,ax+1,w),
   by=clamp(Math.ceil(Math.max(...points.map(v=>v[1]))*h)+3,ay+1,h);
 const mw=bx-ax,mh=by-ay;
 if(mw<2||mh<2||mw*mh>Math.max(w*h,.1e7))return null;
 const mat=cv.Mat.zeros(mh,mw,cv.CV_8UC1),outline=cv.matFromArray(points.length,1,cv.CV_32SC2,
   points.flatMap(([x,y])=>[clamp(Math.round(x*w)-ax,0,mw-1),clamp(Math.round(y*h)-ay,0,mh-1)])),
   vectors=new cv.MatVector();
 try{
   vectors.push_back(outline);
   cv.drawContours(mat,vectors,-1,new cv.Scalar(255),cv.FILLED);
   const contours=new cv.MatVector(),hierarchy=new cv.Mat();
   try{
     cv.findContours(mat,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
     let biggest=null,bigArea=0;
     for(let i=0;i<contours.size();i++){
       const item=contours.get(i),area=cv.contourArea(item);
       if(area>bigArea){biggest?.delete();biggest=item;bigArea=area;}else item.delete();
     }
     if(!biggest)return null;
     try{
       const bounds=cv.boundingRect(biggest),mask=mat.roi(new cv.Rect(bounds.x,bounds.y,bounds.width,bounds.height));
       try{
         const packed=new Uint8Array(mask.data),polyLocal=points.map(([x,y])=>[
           Math.round(x*w)-ax-bounds.x,Math.round(y*h)-ay-bounds.y]);
         return {...box,x:(ax+bounds.x)/w,y:(ay+bounds.y)/h,w:bounds.width/w,h:bounds.height/h,
           pixels:cv.countNonZero(mat),segmentationMethod:'physical',segmentationFailed:false,
           orientedBox:orientedContourBox(cv,biggest,ax,ay,w,h,cv.countNonZero(mat)),
           mask:{width:bounds.width,height:bounds.height,alpha:packed,polygons:[polyLocal],
             topologyPreserved:false}};
       }finally{mask.delete();}
     }finally{biggest.delete();}
   }finally{contours.delete();hierarchy.delete();}
 }finally{vectors.delete();outline.delete();mat.delete();}
}

// Both explicit physical-only and confidence-adaptive modes use this same
// physical candidate path. Adaptive may attempt MorphGAC only if confidence
// is low, and keeps the initial candidate when contraction is unsupported.
export function segmentPhysicalOrAdaptive(cv,p){
 const output=[],qualityContext=createBoundaryConfidenceContext(cv,p);
 try{for(const box of p.boxes||[]){
   const physical=physicalRegion(cv,p,box);
   if(!physical){output.push({...box,segmentationFailed:true,needsBoundaryReview:true});continue;}
   const quality=qualityContext.evaluate(box),candidate={
     ...physical,boundaryConfidence:quality.score,boundaryEvidence:quality,
     needsBoundaryReview:quality.score<.46||!box.physicalBoundary
   };
   if(p.method!=='adaptive'||quality.score>=.46){
     output.push(candidate);continue;
   }
   // No high-confidence independent exterior: run the unchanged MorphGAC
   // implementation as a candidate, not an unconditional replacement.
   const alternate=segmentMaterialBoxes(cv,{...p,boxes:[box]})[0];
   if(!alternate?.mask?.alpha?.length){output.push(candidate);continue;}
   const morphPixels=alternate.mask.alpha.reduce((n,v)=>n+(v>127),0);
   const physicalPixels=physical.mask.alpha.reduce((n,v)=>n+(v>127),0);
   const retention=morphPixels/Math.max(1,physicalPixels);
   const contour=alternate.mask.polygons?.[0]?.map(([px,py])=>[
     alternate.x+px/p.width,alternate.y+py/p.height]);
   const morphQuality=qualityContext.evaluate({physicalBoundary:contour,
     x:alternate.x,y:alternate.y,w:alternate.w,h:alternate.h});
   // Compare independently scored contours, not shape class or only area.
   // The contraction guard prevents swapping paper for interior printing.
   const takeMorph=!box.physicalBoundary||
     retention>=.88&&morphQuality.score>quality.score+.06;
   output.push(takeMorph?
     {...alternate,boundaryConfidence:morphQuality.score,boundaryEvidence:morphQuality,
       boundaryAlternative:'morphgac',needsBoundaryReview:morphQuality.score<.46}:
     {...candidate,boundaryAlternative:'morphgac-not-better',
       alternativeConfidence:morphQuality.score,needsBoundaryReview:true});
 }
 return output;}finally{qualityContext.close();}
}

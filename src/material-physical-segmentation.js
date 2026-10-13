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
 const points=box.physicalBoundary;
 // A detection with only an axis-aligned box is NOT evidence of a paper
 // perimeter. Never make it an opaque rectangle by default.
 if(!Array.isArray(points)||points.length<3)return null;
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
       const bounds=cv.boundingRect(biggest),mask=mat.roi(new cv.Rect(bounds.x,bounds.y,bounds.width,bounds.height)),
         // ROI inherits its parent's row stride (mat.step). OpenCV.js
         // Mat.data is a *linear* view over the underlying WASM address.
         // Directly reading roi.data therefore concatenates bytes from
         // adjacent parent rows and produces diagonal/white stripe artifacts.
         // Match the existing MorphGAC path: copy the ROI to a continuous Mat
         // BEFORE exporting its alpha to JS.
         packedMat=new cv.Mat();
       try{
         mask.copyTo(packedMat);
         const packed=new Uint8Array(packedMat.data),polyLocal=points.map(([x,y])=>[
           Math.round(x*w)-ax-bounds.x,Math.round(y*h)-ay-bounds.y]);
         if(packed.length!==bounds.width*bounds.height)
           throw Error('物理轮廓的连续 Mask 尺寸不一致');
         const originalMaskPixels=cv.countNonZero(mat);
         const exportedPixels=packed.reduce((sum,value)=>sum+(value>0),0);
         if(exportedPixels!==originalMaskPixels){
           // A self-intersecting/fragmented candidate is not a valid single
           // physical object. Return a failed candidate (or let adaptive
           // MorphGAC retry), never turn the region into a full rectangle.
           return null;
         }
         return {...box,x:(ax+bounds.x)/w,y:(ay+bounds.y)/h,w:bounds.width/w,h:bounds.height/h,
           pixels:cv.countNonZero(mat),segmentationMethod:'physical',segmentationFailed:false,
           orientedBox:orientedContourBox(cv,biggest,ax,ay,w,h,cv.countNonZero(mat)),
           mask:{width:bounds.width,height:bounds.height,alpha:packed,polygons:[polyLocal],
             topologyPreserved:false}};
       }finally{packedMat.delete();mask.delete();}
     }finally{biggest.delete();}
   }finally{contours.delete();hierarchy.delete();}
 }finally{vectors.delete();outline.delete();mat.delete();}
}

// No trustworthy exterior in a legacy fallback? Look for a real local
// CLOSED outline before considering a mask. This does not run MorphGAC and
// never fabricates the box as a completely opaque paper.
function localPhysicalFallback(cv,p,box){
 const w=p.width,h=p.height,
   x0=clamp(Math.floor(box.x*w)-5,0,w-1),
   y0=clamp(Math.floor(box.y*h)-5,0,h-1),
   x1=clamp(Math.ceil((box.x+box.w)*w)+5,x0+1,w),
   y1=clamp(Math.ceil((box.y+box.h)*h)+5,y0+1,h),
   rw=x1-x0,rh=y1-y0;
 if(rw<12||rh<12)return null;
 const rgba=cv.matFromArray(h,w,cv.CV_8UC4,p.pixels),
   roi=rgba.roi(new cv.Rect(x0,y0,rw,rh)),gray=new cv.Mat(),
   edges=new cv.Mat(),closed=new cv.Mat(),
   kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(3,3)),
   contours=new cv.MatVector(),hierarchy=new cv.Mat();
 try{
   cv.cvtColor(roi,gray,cv.COLOR_RGBA2GRAY);
   cv.Canny(gray,edges,10,30);
   cv.morphologyEx(edges,closed,cv.MORPH_CLOSE,kernel);
   cv.findContours(closed,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
   let best=null,bestArea=0;
   for(let i=0;i<contours.size();i++){
     const contour=contours.get(i),area=Math.abs(cv.contourArea(contour));
     if(area>bestArea){best?.delete();best=contour;bestArea=area;}else contour.delete();
   }
   if(!best||bestArea<Math.max(40,rw*rh*.025)){best?.delete();return null;}
   try{
     const polygon=new cv.Mat();
     try{
       cv.approxPolyDP(best,polygon,Math.max(1,cv.arcLength(best,true)*.012),true);
       if(polygon.rows<3)return null;
       const boundary=Array.from({length:polygon.rows},(_,i)=>[
         clamp((polygon.data32S[i*2]+x0)/w,0,1),
         clamp((polygon.data32S[i*2+1]+y0)/h,0,1)
       ]);
       return {...box,physicalBoundary:boundary,
         boundarySource:'local-edge-unverified',boundaryPrior:0,
         needsBoundaryReview:true};
     }finally{polygon.delete();}
   }finally{best.delete();}
 }finally{
   hierarchy.delete();contours.delete();kernel.delete();closed.delete();
   edges.delete();gray.delete();roi.delete();rgba.delete();
 }
}

// Both explicit physical-only and confidence-adaptive modes use this same
// physical candidate path. Adaptive may attempt MorphGAC only if confidence
// is low, and keeps the initial candidate when contraction is unsupported.
export function segmentPhysicalOrAdaptive(cv,p){
 const output=[],qualityContext=createBoundaryConfidenceContext(cv,p);
 try{for(const box of p.boxes||[]){
   const candidateBox=box.physicalBoundary?box:localPhysicalFallback(cv,p,box);
   const physical=candidateBox?physicalRegion(cv,p,candidateBox):null;
   if(!physical){
     if(p.method==='adaptive'){
       const alternate=segmentMaterialBoxes(cv,{...p,boxes:[box]})[0];
       if(alternate?.mask?.alpha?.length)output.push({...alternate,
         boundaryAlternative:'morphgac-no-physical-contour',needsBoundaryReview:true});
     }else{
       output.push({...box,segmentationFailed:true,needsBoundaryReview:true,
         boundaryConfidence:0,mask:null});
     }
     continue;
   }
   const quality=qualityContext.evaluate(candidateBox),candidate={
     ...physical,boundaryConfidence:quality.score,boundaryEvidence:quality,
     needsBoundaryReview:quality.score<.46||!box.physicalBoundary||box.needsBoundaryReview===true
   };
   if(p.method!=='adaptive'||(quality.score>=.46&&box.physicalBoundary)){
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
   const takeMorph=retention>=.88&&morphQuality.score>quality.score+.06
     ||(!box.physicalBoundary&&morphQuality.score>quality.score+.03);
   output.push(takeMorph?
     {...alternate,boundaryConfidence:morphQuality.score,boundaryEvidence:morphQuality,
       boundaryAlternative:'morphgac',needsBoundaryReview:morphQuality.score<.46}:
     {...candidate,boundaryAlternative:'morphgac-not-better',
       alternativeConfidence:morphQuality.score,needsBoundaryReview:true});
 }
 return output;}finally{qualityContext.close();}
}

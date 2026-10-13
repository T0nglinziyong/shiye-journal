// Historical no-MorphGAC mask policy from the real-photo Python prototype.
// This module handles PHYSICAL PERIMETERS ONLY. Candidate discovery, page warp,
// morphology-based discovery, apertures, RGB extraction and storage are intact.
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export const SEGMENT_ROI_MARGIN_MM=3;

// Search/read workspace expands beyond the candidate by an additional 3mm.
// This does NOT make 3mm of surrounding A4 paper opaque in the final PNG.
export function expandedSegmentationROI(box,width,height,paperWidthMM=210,paperHeightMM=297){
 const pxPerMM=Math.max(.5,(width/paperWidthMM+height/paperHeightMM)/2),
   pad=Math.max(2,Math.ceil(pxPerMM*SEGMENT_ROI_MARGIN_MM));
 const x0=clamp(Math.floor(box.x*width)-pad,0,width-1),
   y0=clamp(Math.floor(box.y*height)-pad,0,height-1),
   x1=clamp(Math.ceil((box.x+box.w)*width)+pad,x0+1,width),
   y1=clamp(Math.ceil((box.y+box.h)*height)+pad,y0+1,height);
 return {x0,y0,x1,y1,pad};
}
const normalizedPoints=(points,w,h)=>points.map(([x,y])=>[
  clamp(x/w,0,1),clamp(y/h,0,1)]);
function rectanglePoints(box){
 const x=box.x,y=box.y,r=x+box.w,b=y+box.h;
 return [[x,y],[r,y],[r,b],[x,b]];
}

export function physicalPerimeterChoice({hasObserved,source='unknown',
    hullToMinRect=0,hullToBox=0,solidity=1,vertices=0}){
 if(!hasObserved)return 'unverified-rectangle';
 if(source==='ellipse-fit')return 'observed-ellipse'; // ellipse fit is from discovery
 if(source==='lab-carrier'||source==='rotated-paper'||source==='chroma-carrier')
   return 'observed-chroma-hull';
 if(source==='aligned-joint'||source==='partial-L-border'||source==='hough-edges')
   return 'unverified-rectangle';
 // A plate with detached interior food/printing may be split into holes by
 // Canny, despite the existence of a coherent outer enclosing envelope.
 // Convexify only when it is ALSO close to an observed convex outer carrier.
 if(solidity<.68&&hullToMinRect>.82&&hullToBox>.55)
   return 'fragmented-carrier-hull';
 if(source==='irregular-closed'||source==='local-edge-unverified')
   return 'observed-freeform';
 // The initial no-MOR prototype used convex hull for 4-6 vertex paper and a
 // rotated rectangle when the body was nearly rectangular. Never contour
 // inward into the word Life or along isolated printed stars.
 if(vertices>=3&&vertices<=6&&hullToMinRect>=.80&&hullToBox>=.70)
   return 'observed-paper-convex';
 if(hullToMinRect>=.86)
   return 'observed-rotated-rectangle';
 return 'unverified-rectangle';
}

export function selectPhysicalPerimeter(cv,p,box){
 const w=p.width,h=p.height,raw=box.physicalBoundary;
 if(!Array.isArray(raw)||raw.length<3)return {
   points:rectanglePoints(box),boundarySource:'unverified-box',needsBoundaryReview:true,
   perimeterPolicy:'unverified-rectangle'
 };
 const observed=cv.matFromArray(raw.length,1,cv.CV_32SC2,
     raw.flatMap(([x,y])=>[Math.round(x*w),Math.round(y*h)])),
   hull=new cv.Mat(),polygon=new cv.Mat();
 try{
   cv.convexHull(observed,hull,false,true);
   const hullArea=Math.abs(cv.contourArea(hull)),
     observedArea=Math.abs(cv.contourArea(observed)),
     rect=cv.minAreaRect(hull),
     area=Math.max(1,rect.size.width*rect.size.height),
     hullToMinRect=hullArea/area,
     hullToBox=hullArea/Math.max(1,box.w*w*box.h*h),
     solidity=observedArea/Math.max(1,hullArea);
   cv.approxPolyDP(hull,polygon,Math.max(.8,cv.arcLength(hull,true)*.017),true);
   const chosen=physicalPerimeterChoice({hasObserved:true,
     source:box.boundarySource||'unknown',hullToMinRect,hullToBox,
     solidity,vertices:polygon.rows});
   let points=raw;
   if(chosen==='observed-paper-convex'||chosen==='fragmented-carrier-hull'){
     points=normalizedPoints(Array.from({length:polygon.rows},(_,i)=>[
       polygon.data32S[i*2],polygon.data32S[i*2+1]]),w,h);
   }else if(chosen==='observed-chroma-hull'){
     points=normalizedPoints(Array.from({length:hull.rows},(_,i)=>[
       hull.data32S[i*2],hull.data32S[i*2+1]]),w,h);
   }else if(chosen==='observed-rotated-rectangle'){
     points=normalizedPoints(cv.boxPoints(rect).map(v=>[v.x,v.y]),w,h);
   }else if(chosen==='unverified-rectangle'){
     points=rectanglePoints(box);
   }
   return {points,perimeterPolicy:chosen,
     boundarySource:chosen==='observed-paper-convex'||chosen==='observed-rotated-rectangle'
       ?'supported-rect-envelope':box.boundarySource||'unverified-box',
     needsBoundaryReview:box.needsBoundaryReview===true||
       chosen==='unverified-rectangle',
     originalPhysicalBoundary:raw,
     perimeterEvidence:{solidity,hullToMinRect,hullToBox,vertices:polygon.rows}};
 }finally{polygon.delete();hull.delete();observed.delete();}
}

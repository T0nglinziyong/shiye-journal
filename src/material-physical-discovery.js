// Physical-carrier-first discovery. Only the box/mask engine changes: paper
// warp, 9 mm filtering, aperture restoration, original RGB and storage remain
// owned by existing modules. No crop-specific or case-specific coordinates.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const bboxOverlap=(a,b)=>{
 const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),
   w=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-x),
   h=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-y);
 return w*h/Math.max(1,Math.min(a.w*a.h,b.w*b.h));
};
const within=(box,x,y,pad=0)=>x>=box.x-pad&&x<=box.x+box.w+pad&&y>=box.y-pad&&y<=box.y+box.h+pad;
const median=values=>{values.sort((a,b)=>a-b);return values[values.length>>1]||0;};
const order=(a,b)=>a.y-b.y||a.x-b.x;

// Full-page OpenCV Mat objects are worker-owned; temporary contours are
// disposed inside collect(). Cache Canny results by EXACT image + thresholds.
export function discoverPhysicalMaterialBoxes(cv,p,own){
 const w=p.width,h=p.height,minMM=p.smallestMM||6,
   paperW=p.paperWidthMM||210,paperH=p.paperHeightMM||297,
   pxPerMM=Math.max(.5,(w/paperW+h/paperH)/2),
   src=own(cv.matFromArray(h,w,cv.CV_8UC4,p.pixels)),
   gray=own(new cv.Mat()),rgb=own(new cv.Mat()),lab=own(new cv.Mat());
 cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
 cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);
 cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);
 const edgeCache=new Map(),all=[];
 const edges=(lo,hi)=>{
   const key=lo+':'+hi;
   if(!edgeCache.has(key)){const m=own(new cv.Mat());cv.Canny(gray,m,lo,hi);edgeCache.set(key,m);}
   return edgeCache.get(key);
 };
 const contours=(binary,mode,callback)=>{
   const found=new cv.MatVector(),hierarchy=new cv.Mat();
   try{
     cv.findContours(binary,found,hierarchy,mode,cv.CHAIN_APPROX_SIMPLE);
     for(let i=0;i<found.size();i++){
       const c=found.get(i);try{callback(c);}finally{c.delete();}
     }
   }finally{found.delete();hierarchy.delete();}
 };
 const valid=(rect,area,{maxFraction=.70,minPixels=4500}={})=>
   rect.width>=Math.max(20,pxPerMM*minMM)&&rect.height>=Math.max(20,pxPerMM*minMM)&&
   area>=minPixels&&rect.width/w<=maxFraction&&rect.height/h<=maxFraction&&
   rect.x>3&&rect.y>3&&rect.x+rect.width<w-3&&rect.y+rect.height<h-3;
 const add=(contour,kind,confidence,shape='physical')=>{
   const r=cv.boundingRect(contour),a=Math.abs(cv.contourArea(contour));
   if(!valid(r,a))return;
   const polygon=new cv.Mat();
   try{
     const arc=cv.arcLength(contour,true);
     cv.approxPolyDP(contour,polygon,Math.max(1,arc*.0075),true);
     if(polygon.rows<3)return;
     const points=[];
     for(let i=0;i<polygon.rows;i++)points.push([
       clamp(polygon.data32S[2*i]/w,0,1),
       clamp(polygon.data32S[2*i+1]/h,0,1)
     ]);
     all.push({x:r.x/w,y:r.y/h,w:r.width/w,h:r.height/h,
       instanceMethod:'physical-boundary',physicalBoundary:points,
       boundarySource:kind,boundaryPrior:clamp(confidence,0,1),
       shapeModel:null,fillRatio:a/Math.max(1,r.width*r.height),
       physicalShape:shape,absorbedFragments:0});
   }finally{polygon.delete();}
 };
 // 1. Whole-paper contours: closed physical outline rather than interior ink.
 // Multiple Canny thresholds share a single 900px gray raster.
 const settings=[[10,30,5],[8,24,5],[6,18,7],[10,30,11],[20,60,7],[30,90,5]];
 for(const [lo,hi,k] of settings){
   const closed=own(new cv.Mat()),
     kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)));
   cv.morphologyEx(edges(lo,hi),closed,cv.MORPH_CLOSE,kernel);
   contours(closed,cv.RETR_LIST,c=>{
     const r=cv.boundingRect(c),area=Math.abs(cv.contourArea(c));
     if(!valid(r,area,{minPixels:Math.max(900,pxPerMM*pxPerMM*45)}))return;
     const fill=area/Math.max(1,r.width*r.height);
     if(fill<.72)return;
     const approx=new cv.Mat();
     try{
       cv.approxPolyDP(c,approx,Math.max(1,cv.arcLength(c,true)*.03),true);
       if(approx.rows>8||approx.rows<3)return;
       add(c,'edge-closed',fill,'paper');
     }finally{approx.delete();}
   });
 }
 // 2. A4-background-relative Lab chroma carriers. One Lab conversion shared
 // by all thresholds; 25px closing bridges printed stars on one colored sheet.
 const refs=[[],[],[]],data=lab.data;
 for(let y=Math.round(h*.025);y<h*.075;y+=3)
   for(let x=Math.round(w*.08);x<w*.92;x+=3)
     for(let ch=0;ch<3;ch++)refs[ch].push(data[(y*w+x)*3+ch]);
 for(let y=Math.round(h*.925);y<h*.975;y+=3)
   for(let x=Math.round(w*.08);x<w*.92;x+=3)
     for(let ch=0;ch<3;ch++)refs[ch].push(data[(y*w+x)*3+ch]);
 const bgA=median(refs[1]),bgB=median(refs[2]);
 const chroma=new Uint8Array(w*h);
 for(let i=0;i<w*h;i++)chroma[i]=clamp(Math.round(Math.hypot(data[i*3+1]-bgA,data[i*3+2]-bgB)),0,255);
 const chromaMat=own(cv.matFromArray(h,w,cv.CV_8UC1,chroma));
 const closeK=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(25,25))),
   openK=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(7,7)));
 for(const threshold of [11,8,14]){
   const bin=own(new cv.Mat()),closed=own(new cv.Mat()),opened=own(new cv.Mat());
   cv.threshold(chromaMat,bin,threshold,255,cv.THRESH_BINARY);
   const guard=Math.max(12,Math.round(pxPerMM*3));
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)
     if(x<guard||y<guard||x>=w-guard||y>=h-guard)bin.data[y*w+x]=0;
   cv.morphologyEx(bin,closed,cv.MORPH_CLOSE,closeK);
   cv.morphologyEx(closed,opened,cv.MORPH_OPEN,openK);
   contours(opened,cv.RETR_EXTERNAL,c=>{
     const r=cv.boundingRect(c),area=Math.abs(cv.contourArea(c));
     if(!valid(r,area)||area/Math.max(1,r.width*r.height)<.22)return;
     add(c,'lab-carrier',area/Math.max(1,r.width*r.height),'carrier');
   });
 }
 // 3. Irregular exterior outline candidates, including people: never force
 // an irregular but reliable outline through MorphGAC solely due to class.
 for(const [lo,hi] of [[10,30],[12,36],[25,75]]){
   const joined=own(new cv.Mat()),k=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5)));
   cv.morphologyEx(edges(lo,hi),joined,cv.MORPH_CLOSE,k);
   contours(joined,cv.RETR_LIST,c=>{
     const r=cv.boundingRect(c),area=Math.abs(cv.contourArea(c));
     if(!valid(r,area,{minPixels:Math.max(1000,pxPerMM*pxPerMM*75)}))return;
     const fill=area/Math.max(1,r.width*r.height);
     if(fill<.40||fill>.76)return;
     add(c,'irregular-closed',fill,'diecut');
   });
 }
 // Sort large/coherent carriers first, then remove their inner text/stars.
 // This is geometric containment, not the old small-fragment overlap rule.
 const priority=row=>(row.physicalShape==='paper'?1.5:row.physicalShape==='carrier'?1.3:1)*
   row.w*row.h*(.6+.4*row.boundaryPrior);
 all.sort((a,b)=>priority(b)-priority(a));
 const unique=[];
 for(const item of all){
   if(unique.some(row=>bboxOverlap(row,item)>.78))continue;
   unique.push(item);
 }
 // Hough is genuinely on-demand: skip only when reliable candidates explain
 // most edges; uncovered content triggers it. Never suppress a valid old box.
 const covered=new Uint8Array(w*h);
 for(const b of unique){
   const l=Math.max(0,Math.floor(b.x*w-7)),t=Math.max(0,Math.floor(b.y*h-7)),
     r=Math.min(w,Math.ceil((b.x+b.w)*w+7)),d=Math.min(h,Math.ceil((b.y+b.h)*h+7));
   for(let y=t;y<d;y++)covered.fill(1,y*w+l,y*w+r);
 }
 const strong=edges(20,60).data;let observed=0,uncovered=0;
 for(let y=15;y<h-15;y+=2)for(let x=15;x<w-15;x+=2){
   const index=y*w+x;if(!strong[index])continue;observed++;
   if(!covered[index])uncovered++;
 }
 const uncoveredFraction=uncovered/Math.max(1,observed);
 if(uncoveredFraction>.07){
   const lines=new cv.Mat();
   try{
     cv.HoughLinesP(edges(9,27),lines,1,Math.PI/360,27,68,15);
     const vertical=[],horizontal=[];
     for(let i=0;i<lines.rows;i++){
       const [x,y,xx,yy]=Array.from(lines.data32S.slice(i*4,i*4+4));
       if(Math.abs(x-xx)<Math.max(5,Math.abs(yy-y)*.07)&&Math.abs(yy-y)>66)
         vertical.push({x:Math.round((x+xx)/2),y0:Math.min(y,yy),y1:Math.max(y,yy)});
       if(Math.abs(y-yy)<Math.max(5,Math.abs(xx-x)*.06)&&Math.abs(xx-x)>75)
         horizontal.push({x0:Math.min(x,xx),x1:Math.max(x,xx),y:Math.round((y+yy)/2)});
     }
     for(let i=0;i<Math.min(35,vertical.length);i++)for(let j=i+1;j<Math.min(35,vertical.length);j++){
       const a=vertical[i],b=vertical[j],left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),
         top=Math.min(a.y0,b.y0),bottom=Math.max(a.y1,b.y1),ww=right-left,hh=bottom-top;
       if(!(ww>pxPerMM*15&&ww<w*.5&&hh>pxPerMM*15&&hh<h*.65))continue;
       if(Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)<pxPerMM*8)continue;
       const support=horizontal.some(q=>Math.max(0,Math.min(q.x1,right)-Math.max(q.x0,left))>ww*.4&&
         (Math.abs(q.y-top)<14||Math.abs(q.y-bottom)<14));
       if(!support)continue;
       const normalized={x:left/w,y:top/h,w:ww/w,h:hh/h};
       if(unique.some(row=>bboxOverlap(row,normalized)>.34))continue;
       unique.push({...normalized,instanceMethod:'physical-boundary',
         physicalBoundary:[[left/w,top/h],[right/w,top/h],[right/w,bottom/h],[left/w,bottom/h]],
         physicalShape:'partial',boundarySource:'hough-edges',boundaryPrior:.32,
         needsBoundaryReview:true,fillRatio:1,absorbedFragments:0});
     }
   }finally{lines.delete();}
 }
 // Low-confidence fallback is old *box discovery* only. In new discovery mode
 // it rescues disjoint real objects without recreating letters inside a paper.
 if(Array.isArray(p.legacyBoxes)){
   for(const old of p.legacyBoxes){
     const x=old.x+old.w/2,y=old.y+old.h/2;
     if(unique.some(row=>within(row,x,y,.008)))continue;
     if(unique.some(row=>bboxOverlap(row,old)>.25))continue;
     unique.push({...old,instanceMethod:'physical-fallback',
       physicalBoundary:null,boundarySource:'legacy-uncovered',
       boundaryPrior:0,needsBoundaryReview:true});
   }
 }
 return unique.sort(order).slice(0,48);
}

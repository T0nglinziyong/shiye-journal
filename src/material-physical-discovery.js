import {boxIoU,overlapOf,overlapOfSmaller,containsCenter,dedupePhysicalCandidates,mergeAlignedCarrierPieces} from './material-physical-candidates.js';
// Physical-carrier-first discovery. Only the box/mask engine changes: paper
// warp, 9 mm filtering, aperture restoration, original RGB and storage remain
// owned by existing modules. No crop-specific or case-specific coordinates.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
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
 const edgeSupport=(r,lo=10,hi=30)=>{
   const e=edges(lo,hi).data,R=3,pad=4;
   const strips=[[r.x-R,r.y+pad,r.x+R+1,r.y+r.height-pad],
     [r.x+r.width-R,r.y+pad,r.x+r.width+R+1,r.y+r.height-pad],
     [r.x+pad,r.y-R,r.x+r.width-pad,r.y+R+1],
     [r.x+pad,r.y+r.height-R,r.x+r.width-pad,r.y+r.height+R+1]];
   return strips.reduce((total,[xx,yy,xx2,yy2])=>{
     const x0=clamp(Math.floor(xx),0,w),x1=clamp(Math.ceil(xx2),0,w),
       y0=clamp(Math.floor(yy),0,h),y1=clamp(Math.ceil(yy2),0,h);
     let hit=0;
     for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)hit+=e[y*w+x]>0;
     return total+hit/Math.max(1,(x1-x0)*(y1-y0));
   },0);
 };
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
 const valid=(rect,area,{maxFraction=.70,minPixels=4500,
   minWidth=20,minHeight=20,frameMargin=4}={})=>
   rect.width>=Math.max(minWidth,pxPerMM*minMM)&&
   rect.height>=Math.max(minHeight,pxPerMM*minMM)&&
   area>=minPixels&&rect.width/w<=maxFraction&&rect.height/h<=maxFraction&&
   rect.x>frameMargin&&rect.y>frameMargin&&
   rect.x+rect.width<w-frameMargin&&rect.y+rect.height<h-frameMargin;
 const add=(contour,kind,confidence,shape='physical',options={})=>{
   const r=cv.boundingRect(contour),a=Math.abs(cv.contourArea(contour));
   if(!valid(r,a,options))return;
   const polygon=new cv.Mat();
   try{
     const arc=cv.arcLength(contour,true);
     cv.approxPolyDP(contour,polygon,Math.max(1,arc*.017),true);
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
     if(!valid(r,area,{minPixels:Math.max(900,pxPerMM*pxPerMM*45),
       minWidth:60,minHeight:60,maxFraction:.68}))return;
     const fill=area/Math.max(1,r.width*r.height);
     if(fill<.78)return;
     const approx=new cv.Mat();
     try{
       cv.approxPolyDP(c,approx,Math.max(1,cv.arcLength(c,true)*.03),true);
       if(approx.rows>7||approx.rows<3)return;
       const support=edgeSupport(r,lo,hi);
       if(support<.12)return; // reject interior text / incomplete border
       add(c,'edge-closed',Math.min(1,support),'paper',
         {minPixels:Math.max(900,pxPerMM*pxPerMM*45),minWidth:60,minHeight:60,maxFraction:.68});
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
     if(!valid(r,area,{minPixels:5000,minWidth:70,minHeight:65,frameMargin:18})
       ||area/Math.max(1,r.width*r.height)<.23)return;
     const hull=new cv.Mat();
     try{
       cv.convexHull(c,hull,false,true);
       add(hull,'lab-carrier',area/Math.max(1,r.width*r.height),'carrier',
         {minPixels:5000,minWidth:70,minHeight:65,frameMargin:18});
     }finally{hull.delete();}
   });
 }
 // 3. Elliptical paper stock. This was present in the Python experiment
 // but missing from the first JavaScript port, causing the oval label to
 // become a rectangular contour. Its real fitted outline is saved as points.
 for(const [lo,hi] of [[50,150],[20,60],[10,30]]){
   const joined=own(new cv.Mat()),
     k=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(3,3)));
   cv.morphologyEx(edges(lo,hi),joined,cv.MORPH_CLOSE,k);
   contours(joined,cv.RETR_LIST,c=>{
     if(c.rows<5)return;
     const r=cv.boundingRect(c),area=Math.abs(cv.contourArea(c));
     if(area<6000||Math.min(r.width,r.height)<85||
       Math.max(r.width,r.height)>355)return;
     const ellipse=cv.fitEllipse(c),major=Math.max(ellipse.size.width,ellipse.size.height),
       minor=Math.max(1,Math.min(ellipse.size.width,ellipse.size.height)),
       axis=major/minor,areaEllipse=Math.PI*ellipse.size.width*ellipse.size.height/4,
       boxRatio=area/Math.max(1,r.width*r.height),
       fidelity=area/Math.max(1,areaEllipse);
     if(!(boxRatio>.60&&boxRatio<.82&&axis>1.25&&axis<2.7&&
       fidelity>.87&&fidelity<1.13))return;
     const theta=ellipse.angle*Math.PI/180,ct=Math.cos(theta),st=Math.sin(theta),
       points=Array.from({length:64},(_,i)=>{
         const u=2*Math.PI*i/64,a=ellipse.size.width*Math.cos(u)/2,
           b=ellipse.size.height*Math.sin(u)/2;
         return [clamp((ellipse.center.x+a*ct-b*st)/w,0,1),
           clamp((ellipse.center.y+a*st+b*ct)/h,0,1)];
       });
     all.push({x:r.x/w,y:r.y/h,w:r.width/w,h:r.height/h,
       instanceMethod:'physical-boundary',physicalBoundary:points,
       boundarySource:'ellipse-fit',boundaryPrior:clamp(fidelity,0,1),
       physicalShape:'ellipse',fillRatio:boxRatio,absorbedFragments:0});
   });
 }
 // 4. Irregular exterior outline candidates, including people: never force
 // an irregular but reliable outline through MorphGAC solely due to class.
 for(const [lo,hi] of [[10,30],[12,36],[25,75]]){
   const joined=own(new cv.Mat()),k=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5)));
   cv.morphologyEx(edges(lo,hi),joined,cv.MORPH_CLOSE,k);
   contours(joined,cv.RETR_LIST,c=>{
     const r=cv.boundingRect(c),area=Math.abs(cv.contourArea(c));
     if(!valid(r,area,{minPixels:Math.max(1500,pxPerMM*pxPerMM*75),
       minWidth:70,minHeight:70,maxFraction:.65}))return;
     const fill=area/Math.max(1,r.width*r.height);
     if(fill<.43||fill>.70)return;
     add(c,'irregular-closed',fill,'diecut',
       {minPixels:Math.max(1500,pxPerMM*pxPerMM*75),minWidth:70,minHeight:70,maxFraction:.65});
   });
 }
 // Python parity: dedupe physical envelopes, then join closely aligned
 // same-width carrier fragments only when independent evidence paths agree.
 const unique=mergeAlignedCarrierPieces(dedupePhysicalCandidates(all,48),h);
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
     // A scalloped ticket often provides one vertical side and one
     // fragmented lower edge, not a pair of parallel vertical sides.
     const partialLines=new cv.Mat();
     try{
       cv.HoughLinesP(edges(12,36),partialLines,1,Math.PI/180,25,35,17);
       const side=[],bottom=[];
       for(let i=0;i<partialLines.rows;i++){
         const [x,y,xx,yy]=Array.from(partialLines.data32S.slice(i*4,i*4+4));
         const dx=Math.abs(xx-x),dy=Math.abs(yy-y);
         if(dx<Math.max(5,dy*.10)&&dy>60)
           side.push({x0:x,y0:Math.min(y,yy),x1:xx,y1:Math.max(y,yy)});
         if(dy<Math.max(7,dx*.11)&&dx>100)
           bottom.push({x0:Math.min(x,xx),x1:Math.max(x,xx),y:Math.round((y+yy)/2)});
       }
       for(const sideEdge of side.slice(0,45))for(const hEdge of bottom.slice(0,45)){
         const sx=Math.min(sideEdge.x0,sideEdge.x1),
           top=sideEdge.y0,low=sideEdge.y1;
         if(Math.abs(hEdge.x0-sx)>=17||Math.abs(hEdge.y-low)>=9)continue;
         const left=Math.max(0,sx-2),up=Math.max(0,top-2),
           right=Math.min(w-5,hEdge.x1+5),down=Math.min(h-5,low+4),
           ww=right-left,hh=down-up;
         if(!(hh>55&&hh<210&&ww/hh>1.3&&ww/hh<3.9))continue;
         const box={x:left/w,y:up/h,w:ww/w,h:hh/h};
         if(unique.some(item=>overlapOf(box,item)>.20))continue;
         let dark=0,samples=0;
         for(let y=up;y<down;y+=3)for(let x=left;x<right;x+=3){
           dark+=gray.data[y*w+x]<120;samples++;
         }
         if(dark/Math.max(1,samples)<.03)continue;
         unique.push({...box,physicalBoundary:[
           [left/w,up/h],[right/w,up/h],[right/w,down/h],[left/w,down/h]],
           instanceMethod:'physical-boundary',physicalShape:'partial',
           boundarySource:'partial-L-border',boundaryPrior:.30,
           needsBoundaryReview:true,fillRatio:1,absorbedFragments:0});
       }
     }finally{partialLines.delete();}
     for(let i=0;i<Math.min(35,vertical.length);i++)for(let j=i+1;j<Math.min(35,vertical.length);j++){
       const a=vertical[i],b=vertical[j],left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),
         top=Math.min(a.y0,b.y0),bottom=Math.max(a.y1,b.y1),ww=right-left,hh=bottom-top;
       if(!(ww>pxPerMM*15&&ww<w*.5&&hh>pxPerMM*15&&hh<h*.65))continue;
       if(Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)<pxPerMM*8)continue;
       const support=horizontal.some(q=>Math.max(0,Math.min(q.x1,right)-Math.max(q.x0,left))>ww*.4&&
         (Math.abs(q.y-top)<14||Math.abs(q.y-bottom)<14));
       if(!support)continue;
       const normalized={x:left/w,y:top/h,w:ww/w,h:hh/h};
       if(unique.some(row=>overlapOfSmaller(row,normalized)>.34))continue;
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
     if(unique.some(row=>containsCenter(row,old,.008)))continue;
     if(unique.some(row=>overlapOfSmaller(row,old)>.25))continue;
     unique.push({...old,instanceMethod:'physical-fallback',
       physicalBoundary:null,boundarySource:'legacy-uncovered',
       boundaryPrior:0,needsBoundaryReview:true});
   }
 }
 return dedupePhysicalCandidates(unique,48).sort(order);
}

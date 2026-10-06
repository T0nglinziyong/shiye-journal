// Conservative shape-agnostic detector for real openings in a material.
//
// Definition: an opening is an observed region inside the physical carrier
// whose appearance matches the local A4 paper and whose perimeter is enclosed
// by material. No circle/rectangle template is required.
//
// Risk policy: false openings cost more than misses.
// - isolated regions must match paper very closely and contain no foreground evidence;
// - weaker regions require >=4 mutually-consistent OBSERVED openings;
// - no purely predicted opening is ever carved.

const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[(b.length/2)|0];};
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const std=a=>{if(!a.length)return 0;const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));};
const colourDistance=(lab,i,ref)=>{
  const at=i*3,dL=(lab.data[at]-ref.L)/2,da=lab.data[at+1]-ref.a,db=lab.data[at+2]-ref.b;
  return Math.hypot(dL,da,db);
};

function localPaperReference(cv,{mask,lab,page,w,h,pxPerMM,paperRef}){
  const ringSize=Math.max(3,(Math.round(pxPerMM*7)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ringSize,ringSize)),dil=new cv.Mat(),ring=new cv.Mat();
  cv.dilate(mask,dil,kernel);cv.subtract(dil,mask,ring);
  const b=cv.boundingRect(mask),pad=Math.max(3,Math.round(pxPerMM*4)),x0=Math.max(0,b.x-pad),y0=Math.max(0,b.y-pad),x1=Math.min(w,b.x+b.width+pad),y1=Math.min(h,b.y+b.height+pad);
  const L=[],A=[],B=[],step=Math.max(1,Math.round(pxPerMM*.7));
  for(let y=y0;y<y1;y+=step)for(let x=x0;x<x1;x+=step){
    const i=y*w+x;if(!ring.data[i]||!page.data[i])continue;const at=i*3;L.push(lab.data[at]);A.push(lab.data[at+1]);B.push(lab.data[at+2]);
  }
  kernel.delete();dil.delete();ring.delete();
  if(L.length<36)return {...paperRef,localSamples:L.length};
  const medL=median(L),madL=median(L.map(v=>Math.abs(v-medL)));
  return {L:medL,a:median(A),b:median(B),madL,localSamples:L.length};
}

function contourMask(cv,contour,w,h){
  const out=cv.Mat.zeros(h,w,cv.CV_8UC1),v=new cv.MatVector();v.push_back(contour);cv.drawContours(out,v,-1,new cv.Scalar(255),cv.FILLED);v.delete();return out;
}

function describe(cv,{contour,carrier,labROI,evidence,pxPerMM,paperRef,carrierArea,w,h}){
  const area=Math.abs(cv.contourArea(contour));if(area<Math.max(8,pxPerMM*pxPerMM*.35)||area>carrierArea*.10||contour.rows<3)return null;
  const b=cv.boundingRect(contour),component=contourMask(cv,contour,w,h),distances=[],Ls=[];let evidenceN=0,pixels=0;
  for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){
    const i=y*w+x;if(!component.data[i])continue;pixels++;distances.push(colourDistance(labROI,i,paperRef));Ls.push(labROI.data[i*3]);if(evidence?.[i])evidenceN++;
  }
  if(!pixels){component.delete();return null;}
  const sorted=[...distances].sort((a,b)=>a-b),med=median(distances),p90=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.90))],lStd=std(Ls),evidenceFraction=evidenceN/pixels;

  // Enclosure test. Use a wider ring than the old one-pixel ring so a dark
  // physical rim around a punched hole does not hide the surrounding material.
  const ringK=Math.max(5,(Math.round(pxPerMM*2.4)|1)),ringKernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ringK,ringK)),dil=new cv.Mat(),ring=new cv.Mat(),insideRing=new cv.Mat();
  cv.dilate(component,dil,ringKernel);cv.subtract(dil,component,ring);cv.bitwise_and(ring,carrier,insideRing);
  const rb=cv.boundingRect(dil),x0=Math.max(0,rb.x-1),y0=Math.max(0,rb.y-1),x1=Math.min(w,rb.x+rb.width+1),y1=Math.min(h,rb.y+rb.height+1);let ringN=0,materialN=0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=y*w+x;if(!insideRing.data[i])continue;ringN++;if((evidence?.[i])||colourDistance(labROI,i,paperRef)>7)materialN++;}
  const ringMaterialFraction=materialN/Math.max(1,ringN);

  const notCarrier=new cv.Mat(),outside=new cv.Mat();cv.bitwise_not(carrier,notCarrier);cv.bitwise_and(dil,notCarrier,outside);
  const enclosedLeak=cv.countNonZero(outside)/Math.max(1,cv.countNonZero(dil)-pixels);
  ringKernel.delete();dil.delete();ring.delete();insideRing.delete();notCarrier.delete();outside.delete();
  if(enclosedLeak>.035||ringN<8){component.delete();return null;}
  return {contour,component,x:b.x,y:b.y,w:b.width,h:b.height,area,pixels,medianDistance:med,p90Distance:p90,lStd,evidenceFraction,ringMaterialFraction,enclosedLeak,size:Math.sqrt(area)/pxPerMM};
}

function patternPromotions(candidates){
  // Pattern completion never invents holes. It only promotes observed page-like
  // regions after FOUR mutually-consistent members establish a manufactured row.
  const usable=candidates.filter(q=>q.medianDistance<=8&&q.p90Distance<=11&&q.evidenceFraction<.06&&q.size<=12),promoted=new Set();
  if(usable.length<4)return promoted;
  for(let i=0;i<usable.length-2;i++)for(let j=i+1;j<usable.length-1;j++)for(let k=j+1;k<usable.length;k++){
    const seed=[usable[i],usable[j],usable[k]],cx=mean(seed.map(q=>q.x+q.w/2)),cy=mean(seed.map(q=>q.y+q.h/2)),sizes=seed.map(q=>q.size);
    if(std(sizes)/Math.max(1,mean(sizes))>.20)continue;
    let xx=0,xy=0,yy=0;for(const q of seed){const dx=q.x+q.w/2-cx,dy=q.y+q.h/2-cy;xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;}
    const angle=.5*Math.atan2(2*xy,xx-yy),nx=-Math.sin(angle),ny=Math.cos(angle),baseSize=mean(sizes);
    const aligned=usable.filter(q=>{
      const centerX=q.x+q.w/2,centerY=q.y+q.h/2,off=Math.abs((centerX-cx)*nx+(centerY-cy)*ny),sizeRatio=q.size/baseSize;
      return off<=Math.max(2,baseSize*.80)&&sizeRatio>=.70&&sizeRatio<=1.40;
    });
    if(aligned.length<4)continue;
    const tx=Math.cos(angle),ty=Math.sin(angle),proj=aligned.map(q=>({q,t:(q.x+q.w/2-cx)*tx+(q.y+q.h/2-cy)*ty})).sort((a,b)=>a.t-b.t),spacing=[];
    for(let n=1;n<proj.length;n++)spacing.push(proj[n].t-proj[n-1].t);
    if(spacing.length>=2&&std(spacing)/Math.max(1,mean(spacing))>.28)continue;
    for(const {q} of proj)promoted.add(q);
  }
  return promoted;
}

export function carveInternalPaperRegions(cv,{mask,lab,page,evidence,w,h,pxPerMM,paperRef}){
  const b=cv.boundingRect(mask);if(b.width<3||b.height<3)return {count:0,regions:[],diagnostics:[]};

  // roi() can be a strided Mat view in OpenCV.js. Copy before direct .data
  // indexing or Lab/mask coordinates become silently misaligned.
  const carrierView=mask.roi(new cv.Rect(b.x,b.y,b.width,b.height)),carrier=new cv.Mat();carrierView.copyTo(carrier);carrierView.delete();
  const labView=lab.roi(new cv.Rect(b.x,b.y,b.width,b.height)),labROI=new cv.Mat();labView.copyTo(labROI);labView.delete();

  const localEvidence=new Uint8Array(b.width*b.height);
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++)localEvidence[y*b.width+x]=evidence?.[(b.y+y)*w+b.x+x]||0;
  const ref=localPaperReference(cv,{mask,lab,page,w,h,pxPerMM,paperRef}),pageLike=cv.Mat.zeros(b.height,b.width,cv.CV_8UC1);

  for(let y=1;y<b.height-1;y++)for(let x=1;x<b.width-1;x++){
    const i=y*b.width+x;if(!carrier.data[i]||localEvidence[i])continue;
    const d=colourDistance(labROI,i,ref),L=labROI.data[i*3],texture=Math.abs(L-(labROI.data[(i-1)*3]+labROI.data[(i+1)*3]+labROI.data[(i-b.width)*3]+labROI.data[(i+b.width)*3])/4);
    if(d<=9.0&&texture<=6.0)pageLike.data[i]=255;
  }

  const k=Math.max(3,(Math.round(pxPerMM*.45)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)),clean=new cv.Mat();cv.morphologyEx(pageLike,clean,cv.MORPH_OPEN,kernel);cv.morphologyEx(clean,clean,cv.MORPH_CLOSE,kernel);
  const contours=new cv.MatVector(),hierarchy=new cv.Mat();cv.findContours(clean,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
  const carrierArea=cv.countNonZero(carrier),candidates=[];
  for(let i=0;i<contours.size();i++){const q=contours.get(i),d=describe(cv,{contour:q,carrier,labROI,evidence:localEvidence,pxPerMM,paperRef:ref,carrierArea,w:b.width,h:b.height});if(d)candidates.push(d);else q.delete();}

  const repeated=patternPromotions(candidates),accepted=[];
  for(const q of candidates){
    // Exact paper match + enclosure is enough for an isolated opening; the
    // printed-panel failure case is excluded because printed pixels carry
    // foreground evidence. We intentionally do NOT require the immediate rim
    // to be material-coloured: real punched holes often have a dark/neutral rim.
    const isolated=q.medianDistance<=2.8&&q.p90Distance<=4.5&&q.lStd<=4.0&&q.evidenceFraction<.01;
    const patterned=repeated.has(q)&&q.size<=12&&q.medianDistance<=8.0&&q.p90Distance<=11.0&&q.lStd<=6.0&&q.evidenceFraction<.06;
    if(isolated||patterned)accepted.push(q);else{q.component.delete();q.contour.delete();}
  }

  const target=mask.roi(new cv.Rect(b.x,b.y,b.width,b.height));
  for(const q of accepted)target.setTo(new cv.Scalar(0),q.component);
  target.delete();

  const regions=accepted.map(q=>({x:b.x+q.x,y:b.y+q.y,w:q.w,h:q.h,area:q.area,medianDistance:q.medianDistance,p90Distance:q.p90Distance,patterned:repeated.has(q)}));
  const diagnostics=candidates.map(q=>({area:q.area,medianDistance:q.medianDistance,p90Distance:q.p90Distance,lStd:q.lStd,evidenceFraction:q.evidenceFraction,ringMaterialFraction:q.ringMaterialFraction,enclosedLeak:q.enclosedLeak,size:q.size,accepted:accepted.includes(q),patterned:repeated.has(q)}));
  for(const q of accepted){q.component.delete();q.contour.delete();}
  carrier.delete();labROI.delete();pageLike.delete();kernel.delete();clean.delete();contours.delete();hierarchy.delete();
  return {count:regions.length,regions,paperRef:ref,diagnostics};
}

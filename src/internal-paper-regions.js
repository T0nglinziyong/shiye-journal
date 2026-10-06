// Conservative, shape-agnostic internal paper-region detector.
//
// A transparent opening is not "a circle". It is any enclosed region whose
// appearance is statistically indistinguishable from the surrounding A4 paper.
// False openings are more costly than misses, so carving is intentionally
// asymmetric:
//   1) isolated regions require an extremely strong paper-colour/purity match;
//   2) weaker regions are accepted only when several mutually-consistent
//      openings establish a manufacturing pattern;
//   3) every accepted region must be fully enclosed by material.
//
// The returned mask keeps the observed component shape; no circle/rectangle
// template is imposed.

const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[(b.length/2)|0];};
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const std=a=>{if(!a.length)return 0;const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));};
const colourDistance=(lab,i,ref)=>{
  const at=i*3,dL=(lab.data[at]-ref.L)/2,da=lab.data[at+1]-ref.a,db=lab.data[at+2]-ref.b;
  return Math.hypot(dL,da,db);
};

function localPaperReference(cv,{mask,lab,page,w,h,pxPerMM,paperRef}){
  const ringSize=Math.max(3,(Math.round(pxPerMM*8)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(ringSize,ringSize)),dil=new cv.Mat(),ring=new cv.Mat();
  cv.dilate(mask,dil,kernel);cv.subtract(dil,mask,ring);
  const L=[],A=[],B=[],step=Math.max(1,Math.round(pxPerMM*.7));
  const b=cv.boundingRect(mask),pad=Math.max(3,Math.round(pxPerMM*5)),x0=Math.max(0,b.x-pad),y0=Math.max(0,b.y-pad),x1=Math.min(w,b.x+b.width+pad),y1=Math.min(h,b.y+b.height+pad);
  for(let y=y0;y<y1;y+=step)for(let x=x0;x<x1;x+=step){
    const i=y*w+x;if(!ring.data[i]||!page.data[i])continue;const at=i*3;L.push(lab.data[at]);A.push(lab.data[at+1]);B.push(lab.data[at+2]);
  }
  kernel.delete();dil.delete();ring.delete();
  if(L.length<48)return {...paperRef,localSamples:L.length};
  const medL=median(L),madL=median(L.map(v=>Math.abs(v-medL)));
  return {L:medL,a:median(A),b:median(B),madL,localSamples:L.length};
}

function componentMask(cv,labels,label,roiW,roiH,x,y,w,h){
  const m=cv.Mat.zeros(roiH,roiW,cv.CV_8UC1);
  // connectedComponentsWithStats already gives the component bbox. Scanning
  // the entire ROI once per component caused the previous O(K*N) slowdown.
  for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const i=yy*roiW+xx;if(labels.data32S[i]===label)m.data[i]=255;}
  return m;
}

function ringStats(cv,{component,carrier,labROI,evidence,w:rw,h:rh,pxPerMM,paperRef}){
  const k=Math.max(3,(Math.round(pxPerMM*1.2)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)),dil=new cv.Mat(),ring=new cv.Mat(),insideRing=new cv.Mat();
  cv.dilate(component,dil,kernel);cv.subtract(dil,component,ring);cv.bitwise_and(ring,carrier,insideRing);
  let ringN=0,materialN=0;const distances=[],rb=cv.boundingRect(dil),x0=Math.max(0,rb.x-2),y0=Math.max(0,rb.y-2),x1=Math.min(rw,rb.x+rb.width+2),y1=Math.min(rh,rb.y+rb.height+2);
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const i=y*rw+x;if(!insideRing.data[i])continue;ringN++;const d=colourDistance(labROI,i,paperRef);distances.push(d);if((evidence?.[i])||d>7)materialN++;
  }
  kernel.delete();dil.delete();ring.delete();insideRing.delete();
  return {ringN,materialFraction:materialN/Math.max(1,ringN),ringDistance:median(distances)};
}

function describeComponent(cv,{labels,label,stats,carrier,labROI,evidence,pxPerMM,paperRef,carrierArea,roiW,roiH}){
  const x=stats.data32S[label*5],y=stats.data32S[label*5+1],w=stats.data32S[label*5+2],h=stats.data32S[label*5+3],area=stats.data32S[label*5+4];
  if(area<Math.max(8,pxPerMM*pxPerMM*.35)||area>carrierArea*.10||w<2||h<2)return null;
  const comp=componentMask(cv,labels,label,roiW,roiH,x,y,w,h),dists=[],Ls=[];let evidenceN=0;
  for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){
    const i=yy*roiW+xx;if(!comp.data[i])continue;dists.push(colourDistance(labROI,i,paperRef));Ls.push(labROI.data[i*3]);if(evidence?.[i])evidenceN++;
  }
  const med=median(dists),p90=[...dists].sort((a,b)=>a-b)[Math.min(dists.length-1,Math.floor(dists.length*.90))],lStd=std(Ls),evidenceFraction=evidenceN/Math.max(1,area);
  const ring=ringStats(cv,{component:comp,carrier,labROI,evidence,w:roiW,h:roiH,pxPerMM,paperRef});

  // The opening must be surrounded by material. This also ensures that a
  // paper-like patch connected to the outer background is not carved.
  const k=Math.max(3,(Math.round(pxPerMM*.8)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)),dil=new cv.Mat(),outside=new cv.Mat(),notCarrier=new cv.Mat();
  cv.dilate(comp,dil,kernel);cv.bitwise_not(carrier,notCarrier);cv.bitwise_and(dil,notCarrier,outside);
  const enclosedLeak=cv.countNonZero(outside)/Math.max(1,cv.countNonZero(dil)-area);
  kernel.delete();dil.delete();outside.delete();notCarrier.delete();

  const result={label,x,y,w,h,area,component:comp,medianDistance:med,p90Distance:p90,lStd,evidenceFraction,ringMaterialFraction:ring.materialFraction,ringDistance:ring.ringDistance,enclosedLeak,size:Math.sqrt(area)/pxPerMM};
  if(enclosedLeak>.04||ring.ringN<8){comp.delete();return null;}
  return result;
}

function patternPromotions(candidates){
  // Shape-agnostic manufacturing consistency: similar area + similar size +
  // near-collinear centers. This is only a recall boost; it never creates a
  // predicted opening without observed paper-like pixels.
  const promoted=new Set(),usable=candidates.filter(x=>x.medianDistance<=7.5&&x.p90Distance<=11&&x.evidenceFraction<.08&&x.ringMaterialFraction>=.16);
  for(let i=0;i<usable.length;i++)for(let j=i+1;j<usable.length;j++)for(let k=j+1;k<usable.length;k++){
    const triple=[usable[i],usable[j],usable[k]],cx=mean(triple.map(q=>q.x+q.w/2)),cy=mean(triple.map(q=>q.y+q.h/2)),areas=triple.map(q=>q.area),sizes=triple.map(q=>q.size);
    if(std(areas)/Math.max(1,mean(areas))>.28||std(sizes)/Math.max(1,mean(sizes))>.20)continue;
    let xx=0,xy=0,yy=0;for(const q of triple){const dx=q.x+q.w/2-cx,dy=q.y+q.h/2-cy;xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;}
    const angle=.5*Math.atan2(2*xy,xx-yy),nx=-Math.sin(angle),ny=Math.cos(angle),perp=triple.map(q=>Math.abs((q.x+q.w/2-cx)*nx+(q.y+q.h/2-cy)*ny));
    if(Math.max(...perp)>Math.max(2,mean(sizes)*.75))continue;
    for(const q of usable){
      const centerX=q.x+q.w/2,centerY=q.y+q.h/2,off=Math.abs((centerX-cx)*nx+(centerY-cy)*ny),areaRatio=q.area/mean(areas),sizeRatio=q.size/mean(sizes);
      if(off<=Math.max(2,mean(sizes)*.85)&&areaRatio>=.55&&areaRatio<=1.7&&sizeRatio>=.7&&sizeRatio<=1.45)promoted.add(q);
    }
  }
  return promoted;
}

export function carveInternalPaperRegions(cv,{mask,lab,page,evidence,w,h,pxPerMM,paperRef}){
  const b=cv.boundingRect(mask);if(b.width<3||b.height<3)return {count:0,regions:[]};
  const carrier=mask.roi(new cv.Rect(b.x,b.y,b.width,b.height)),labROI=lab.roi(new cv.Rect(b.x,b.y,b.width,b.height)),localEvidence=new Uint8Array(b.width*b.height);
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++)localEvidence[y*b.width+x]=evidence?.[(b.y+y)*w+b.x+x]||0;
  const ref=localPaperReference(cv,{mask,lab,page,w,h,pxPerMM,paperRef}),pageLike=cv.Mat.zeros(b.height,b.width,cv.CV_8UC1);

  for(let y=1;y<b.height-1;y++)for(let x=1;x<b.width-1;x++){
    const i=y*b.width+x;if(!carrier.data[i]||localEvidence[i])continue;
    const d=colourDistance(labROI,i,ref),L=labROI.data[i*3],texture=Math.abs(L-(labROI.data[(i-1)*3]+labROI.data[(i+1)*3]+labROI.data[(i-b.width)*3]+labROI.data[(i+b.width)*3])/4);
    if(d<=8.0&&texture<=5.0)pageLike.data[i]=255;
  }

  const k=Math.max(3,(Math.round(pxPerMM*.45)|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(k,k)),clean=new cv.Mat();cv.morphologyEx(pageLike,clean,cv.MORPH_OPEN,kernel);cv.morphologyEx(clean,clean,cv.MORPH_CLOSE,kernel);
  const labels=new cv.Mat(),stats=new cv.Mat(),centroids=new cv.Mat(),n=cv.connectedComponentsWithStats(clean,labels,stats,centroids,8,cv.CV_32S),carrierArea=cv.countNonZero(carrier),candidates=[];
  for(let label=1;label<n;label++){
    const q=describeComponent(cv,{labels,label,stats,carrier,labROI,evidence:localEvidence,pxPerMM,paperRef:ref,carrierArea,roiW:b.width,roiH:b.height});
    if(q)candidates.push(q);
  }

  const repeated=patternPromotions(candidates),accepted=[];
  for(const q of candidates){
    // Isolated openings require an extremely close match to the local paper.
    // This is intentionally stricter than repeated-pattern members because a
    // false cut is more damaging than a missed aperture.
    const isolated=q.medianDistance<=3.8&&q.p90Distance<=5.8&&q.lStd<=3.2&&q.evidenceFraction<.025&&q.ringMaterialFraction>=.22;
    const patterned=repeated.has(q)&&q.medianDistance<=7.0&&q.p90Distance<=10.0&&q.lStd<=4.8&&q.evidenceFraction<.06&&q.ringMaterialFraction>=.16;
    if(isolated||patterned)accepted.push(q);else q.component.delete();
  }

  for(const q of accepted){
    const target=mask.roi(new cv.Rect(b.x,b.y,b.width,b.height));target.setTo(new cv.Scalar(0),q.component);target.delete();
  }
  const regions=accepted.map(q=>({x:b.x+q.x,y:b.y+q.y,w:q.w,h:q.h,area:q.area,medianDistance:q.medianDistance,p90Distance:q.p90Distance,patterned:repeated.has(q)}));
  for(const q of accepted)q.component.delete();
  carrier.delete();labROI.delete();pageLike.delete();kernel.delete();clean.delete();labels.delete();stats.delete();centroids.delete();
  return {count:regions.length,regions,paperRef:ref};
}

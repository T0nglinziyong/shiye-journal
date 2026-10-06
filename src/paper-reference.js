const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[(b.length/2)|0];};

function patchMedian(lab,w,h,x0,y0,x1,y1){
  const L=[],A=[],B=[];
  const sx=Math.max(1,Math.floor((x1-x0)/18)),sy=Math.max(1,Math.floor((y1-y0)/18));
  for(let y=y0;y<y1;y+=sy)for(let x=x0;x<x1;x+=sx){const at=(y*w+x)*3;L.push(lab.data[at]);A.push(lab.data[at+1]);B.push(lab.data[at+2]);}
  return {L:median(L),a:median(A),b:median(B),n:L.length};
}

export function robustPaperLab(lab,page,w,h){
  // Domain constraint: imported materials are never placed flush against the
  // A4 border. Therefore an inset perimeter band is a stronger background
  // reference than arbitrary page-connected pixels. We deliberately skip the
  // exact warp edge and use robust statistics so one shadowed corner/side does
  // not dominate the paper model.
  const pxPerMM=Math.max(.5,((w/210)+(h/297))/2),inner=Math.max(3,Math.round(pxPerMM*2.5)),outer=Math.max(inner+3,Math.round(pxPerMM*11));
  const L=[],A=[],B=[],step=Math.max(2,Math.round(Math.max(w,h)/520));
  for(let y=inner;y<h-inner;y+=step)for(let x=inner;x<w-inner;x+=step){
    const inBand=x<outer||x>=w-outer||y<outer||y>=h-outer;if(!inBand)continue;
    const at=(y*w+x)*3;L.push(lab.data[at]);A.push(lab.data[at+1]);B.push(lab.data[at+2]);
  }
  const sortedL=[...L].sort((a,b)=>a-b),bandRef={
    // A shadow mostly lowers L; the 65th percentile is a better paper-lightness
    // anchor than the median while still ignoring specular outliers.
    L:sortedL.length?sortedL[Math.min(sortedL.length-1,Math.floor(sortedL.length*.65))]:238,
    a:median(A)||128,b:median(B)||128
  };

  // Page-connected samples remain useful locally, but cannot override the
  // chroma of the trusted perimeter band by more than a small amount.
  const cL=[],cA=[],cB=[];
  if(page?.data)for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){const i=y*w+x;if(!page.data[i])continue;const at=i*3;cL.push(lab.data[at]);cA.push(lab.data[at+1]);cB.push(lab.data[at+2]);}
  if(cL.length>=180){
    const connected={L:median(cL),a:median(cA),b:median(cB)};
    return {
      L:connected.L,
      a:Math.abs(connected.a-bandRef.a)<=5?connected.a:bandRef.a,
      b:Math.abs(connected.b-bandRef.b)<=5?connected.b:bandRef.b,
      reliable:true,bandRef,samples:cL.length
    };
  }
  return {...bandRef,reliable:L.length>=120,bandRef,samples:L.length};
}

export function localPageLab(lab,page,w,h,ringMask,fallback){
  const L=[],A=[],B=[];
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){const i=y*w+x;if(!ringMask.data[i]||(page?.data&&!page.data[i]))continue;const at=i*3;L.push(lab.data[at]);A.push(lab.data[at+1]);B.push(lab.data[at+2]);}
  if(L.length<80)return {...fallback,samples:L.length};
  const medL=median(L),mad=median(L.map(v=>Math.abs(v-medL)));
  return {L:medL,a:median(A),b:median(B),madL:mad,samples:L.length};
}

const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[(b.length/2)|0];};

function patchMedian(lab,w,h,x0,y0,x1,y1){
  const L=[],A=[],B=[];
  const sx=Math.max(1,Math.floor((x1-x0)/18)),sy=Math.max(1,Math.floor((y1-y0)/18));
  for(let y=y0;y<y1;y+=sy)for(let x=x0;x<x1;x+=sx){const at=(y*w+x)*3;L.push(lab.data[at]);A.push(lab.data[at+1]);B.push(lab.data[at+2]);}
  return {L:median(L),a:median(A),b:median(B),n:L.length};
}

export function robustPaperLab(lab,page,w,h){
  // Corners are only a robust fallback / regularizer. We sample them inset
  // from the rectified frame, so interpolation at the exact warp border is not
  // treated as paper colour. One shadowed corner cannot dominate the median.
  const insetX=Math.max(3,Math.round(w*.025)),insetY=Math.max(3,Math.round(h*.025)),pw=Math.max(12,Math.round(w*.09)),ph=Math.max(12,Math.round(h*.07));
  const patches=[
    patchMedian(lab,w,h,insetX,insetY,Math.min(w,insetX+pw),Math.min(h,insetY+ph)),
    patchMedian(lab,w,h,Math.max(0,w-insetX-pw),insetY,w-insetX,Math.min(h,insetY+ph)),
    patchMedian(lab,w,h,insetX,Math.max(0,h-insetY-ph),Math.min(w,insetX+pw),h-insetY),
    patchMedian(lab,w,h,Math.max(0,w-insetX-pw),Math.max(0,h-insetY-ph),w-insetX,h-insetY)
  ];
  const cornerRef={L:median(patches.map(x=>x.L)),a:median(patches.map(x=>x.a)),b:median(patches.map(x=>x.b))};
  const L=[],A=[],B=[],step=Math.max(2,Math.round(Math.max(w,h)/420));
  if(page?.data)for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){const i=y*w+x;if(!page.data[i])continue;const at=i*3;L.push(lab.data[at]);A.push(lab.data[at+1]);B.push(lab.data[at+2]);}
  if(L.length>=180){
    const connected={L:median(L),a:median(A),b:median(B)};
    // L can move with illumination/shadows. a/b are much more stable, while
    // the corner median prevents a single polluted page-connected component
    // from teaching the model a material colour.
    return {L:connected.L,a:Math.abs(connected.a-cornerRef.a)<=6?connected.a:cornerRef.a,b:Math.abs(connected.b-cornerRef.b)<=6?connected.b:cornerRef.b,reliable:true,cornerRef};
  }
  return {...cornerRef,reliable:false,cornerRef};
}

export function localPageLab(lab,page,w,h,ringMask,fallback){
  const L=[],A=[],B=[];
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){const i=y*w+x;if(!ringMask.data[i]||(page?.data&&!page.data[i]))continue;const at=i*3;L.push(lab.data[at]);A.push(lab.data[at+1]);B.push(lab.data[at+2]);}
  if(L.length<80)return {...fallback,samples:L.length};
  const medL=median(L),mad=median(L.map(v=>Math.abs(v-medL)));
  return {L:medL,a:median(A),b:median(B),madL:mad,samples:L.length};
}

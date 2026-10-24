// Preserve real, complete physical paper during optional shape cleanup.
// The postprocessor may follow printed letters instead of the faint exterior.
const area=r=>Number(r?.pixels)||r?.mask?.alpha?.reduce((n,v)=>n+(v>127),0)||0;
// Compare the same scene pixels across before/after masks. An optional
// geometric shape fit can retain area and bounding box yet erase Life's
// lettering or a star-sheet interior. This safeguard is also used by Node
// regression tests: only ONE algorithm is used in the browser and in tests.
export function detectRemovedPhysicalInterior(before,after){
  const a=before?.mask,b=after?.mask;
  if(!a?.alpha?.length||!b?.alpha?.length||!before.w||!before.h||!after.w||!after.h)
    return {removed:0,sampled:0};
  const aw=a.width,ah=a.height,bw=b.width,bh=b.height;
  if(aw<7||ah<7||bw<1||bh<1)return {removed:0,sampled:0};
  let sampled=0,removed=0;
  for(let y=3;y<ah-3;y+=2)for(let x=3;x<aw-3;x+=2){
    if(a.alpha[y*aw+x]<220)continue;
    let interior=true;
    for(let dy=-3;dy<=3&&interior;dy+=3)
      for(let dx=-3;dx<=3;dx+=3)if(a.alpha[(y+dy)*aw+x+dx]<220){interior=false;break;}
    if(!interior)continue;
    sampled++;
    const px=before.x+(x+.5)*before.w/aw,py=before.y+(y+.5)*before.h/ah,
      tx=Math.floor((px-after.x)*bw/after.w),
      ty=Math.floor((py-after.y)*bh/after.h);
    let present=false;
    for(let dy=-1;dy<=1&&!present;dy++)
      for(let dx=-1;dx<=1;dx++){
        const u=tx+dx,v=ty+dy;
        if(u>=0&&u<bw&&v>=0&&v<bh&&b.alpha[v*bw+u]>=128){present=true;break;}
      }
    if(!present)removed++;
  }
  return {removed,sampled};
}

export function keepPhysicalBeforeUnsafeRegularization(before,after){
 if(before?.segmentationMethod!=='physical'||!before?.mask?.alpha?.length)
   return after||before;
 if(!after?.mask?.alpha?.length)return {...before,shapeGuard:'missing-refined-alpha'};
 const initial=area(before),revised=area(after);
 if(!initial||!revised)return {...before,shapeGuard:'empty-refined-alpha'};
 const protectedPaper=before.boundarySource==='supported-rect-envelope';
 const allowableLoss=protectedPaper?.012:.075;
 const minWidth=protectedPaper?.975:.88, minHeight=protectedPaper?.975:.88;
 const loss=revised/initial<1-allowableLoss;
 const shrink=after.w<before.w*minWidth||after.h<before.h*minHeight;
 // Normalized bbox may shift even with similar mask area; preserve the actual
 // physical perimeter if the postprocess tracked internal print instead.
 const centerX=r=>r.x+r.w/2,centerY=r=>r.y+r.h/2;
 const displaced=Math.abs(centerX(after)-centerX(before))>before.w*(protectedPaper?.015:.10)||
   Math.abs(centerY(after)-centerY(before))>before.h*(protectedPaper?.015:.10);
 // Preserve genuine outer-boundary improvements, but not holes/erasure
 // deep inside an already accepted physical material. Existing cutouts with
 // holes are supported because only initially opaque interior is examined.
 const integrity=detectRemovedPhysicalInterior(before,after);
 const missingInterior=integrity.sampled>0&&
   integrity.removed>Math.max(5,Math.round(integrity.sampled*(protectedPaper?.002:.006)));
 return loss||shrink||displaced||missingInterior
   ?{...before,shapeGuard:missingInterior?'preserved-interior-content':'preserved-physical-perimeter',
      postprocessCandidateArea:revised,postprocessDeletedInterior:integrity.removed}
   :after;
}

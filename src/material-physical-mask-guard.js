// Preserve real, complete physical paper during optional shape cleanup.
// The postprocessor may follow printed letters instead of the faint exterior.
const area=r=>Number(r?.pixels)||r?.mask?.alpha?.reduce((n,v)=>n+(v>127),0)||0;
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
 return loss||shrink||displaced
   ?{...before,shapeGuard:'preserved-physical-perimeter',
      postprocessCandidateArea:revised}
   :after;
}

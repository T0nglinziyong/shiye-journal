// A hand-drawn box is a search area, not a cutout. Run the existing recognizer
// only inside a padded area around changed boxes and map its mask back to the
// paper coordinate system. Unchanged candidates retain their original bytes.
export const sameRegion=(a,b)=>!!a&&!!b&&['x','y','w','h','rotation'].every(key=>Math.abs((a[key]||0)-(b[key]||0))<1e-6);

export function paddedRegion(box,margin=.16){
  const dx=Math.max(.012,box.w*margin),dy=Math.max(.012,box.h*margin);
  const x=Math.max(0,box.x-dx),y=Math.max(0,box.y-dy);
  return {x,y,w:Math.min(1,x+box.w+2*dx)-x,h:Math.min(1,y+box.h+2*dy)-y};
}

export function candidateInPaper(candidate,search){
  return {...candidate,x:search.x+candidate.x*search.w,y:search.y+candidate.y*search.h,w:candidate.w*search.w,h:candidate.h*search.h};
}

export function chooseManualCandidate(box,candidates,search){
  const scored=candidates.map(candidate=>{
    const region=candidateInPaper(candidate,search),right=Math.min(box.x+box.w,region.x+region.w),bottom=Math.min(box.y+box.h,region.y+region.h);
    const overlap=Math.max(0,right-Math.max(box.x,region.x))*Math.max(0,bottom-Math.max(box.y,region.y));
    const area=region.w*region.h,boxArea=box.w*box.h;
    const centreInside=region.x+region.w/2>=box.x&&region.x+region.w/2<=box.x+box.w&&region.y+region.h/2>=box.y&&region.y+region.h/2<=box.y+box.h;
    return {region,score:centreInside&&overlap/Math.max(area,1e-9)>=.55&&overlap/Math.max(boxArea,1e-9)>=.08?overlap/boxArea:-1};
  }).sort((a,b)=>b.score-a.score);
  return scored[0]?.score>0?scored[0].region:null;
}

export async function refineManualBoxes(boxes,previous,recognize){
  const used=new Set(),next=[];
  for(let i=0;i<boxes.length;i++){
    const box=boxes[i],source=box.sourceIndex;
    // The editor tracks which boxes the user actually moved. Segmentation can
    // tighten an unchanged contour by a few pixels, so coordinates alone are
    // not a reliable identity for preserving its original cutout bytes.
    const tracked=Number.isInteger(source)&&!box.manualChanged&&previous[source]&&!used.has(source)?source:-1;
    const index=tracked>=0?tracked:previous.findIndex((candidate,j)=>!used.has(j)&&sameRegion(candidate.region,box));
    if(index>=0){used.add(index);next.push({region:previous[index].region,original:previous[index]});continue;}
    const region=await recognize(box,i);
    if(!region)throw Error('第 '+(i+1)+' 个框内没有找到可靠素材；请贴近素材重画，或在“检查边缘”中调整');
    next.push({region,original:null});
  }
  return next;
}

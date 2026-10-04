// Fuse two independent proposal families:
// 1) Lab/colour candidates are good at proving "there is material here".
// 2) closed edge enclosures are good at proving the physical outer boundary,
//    including pale/white regions that colour segmentation may erase.
const area=r=>Math.max(0,r.w)*Math.max(0,r.h);
const intersection=(a,b)=>{
  const l=Math.max(a.x,b.x),t=Math.max(a.y,b.y),r=Math.min(a.x+a.w,b.x+b.w),d=Math.min(a.y+a.h,b.y+b.h);
  return Math.max(0,r-l)*Math.max(0,d-t);
};
const overlapSmall=(a,b)=>intersection(a,b)/Math.max(1e-9,Math.min(area(a),area(b)));
const overlapOf=(a,b)=>intersection(a,b)/Math.max(1e-9,area(a));
const iou=(a,b)=>intersection(a,b)/Math.max(1e-9,area(a)+area(b)-intersection(a,b));

export function fuseRecognitionCandidates(colourCandidates,structuralCandidates){
  const colours=colourCandidates.map((candidate,index)=>({candidate,index,used:false})),result=[];
  for(const structural of [...structuralCandidates].sort((a,b)=>(b.structuralConfidence||0)-(a.structuralConfidence||0))){
    const matches=colours.filter(entry=>!entry.used&&(overlapOf(entry.candidate,structural)>=.42||overlapSmall(entry.candidate,structural)>=.58||iou(entry.candidate,structural)>=.34));
    const strong=(structural.structuralConfidence||0)>=.68;
    if(!matches.length&&!strong)continue;
    // A trusted closed physical boundary may replace several disjoint colour
    // islands (e.g. three figures printed on one white sticker).
    for(const entry of matches)entry.used=true;
    result.push(structural);
  }
  for(const entry of colours)if(!entry.used)result.push(entry.candidate);

  // Final NMS favours structural boundaries over colour proposals when they
  // describe the same physical object; otherwise keep distinct neighbours.
  const ordered=result.sort((a,b)=>(b.edgeMethod==='edge-enclosure')-(a.edgeMethod==='edge-enclosure')||area(b)-area(a));
  const kept=[];
  for(const candidate of ordered){
    const duplicate=kept.find(other=>iou(candidate,other)>.62||overlapSmall(candidate,other)>.88);
    if(!duplicate)kept.push(candidate);
  }
  return kept.sort((a,b)=>a.y-b.y||a.x-b.x);
}

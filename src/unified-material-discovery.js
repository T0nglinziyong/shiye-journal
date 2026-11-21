import {boxArea, overlapOfSmaller} from './material-physical-candidates.js';

// V8 research keeps measured exterior carriers and uses the older foreground
// components only to recover genuinely uncovered objects. This projection is
// deliberately geometry-only: source labels never choose a mask algorithm.
const center=(box)=>({x:box.x+box.w/2,y:box.y+box.h/2});
const within=(outer,point,pad=0)=>point.x>=outer.x-pad&&point.x<=outer.x+outer.w+pad
  &&point.y>=outer.y-pad&&point.y<=outer.y+outer.h+pad;
const shortFrameDebris=box=>{
  const nearFrame=box.x<.012||box.y<.012||box.x+box.w>.988||box.y+box.h>.988;
  return nearFrame&&boxArea(box)<.03;
};

export function unifyCarrierCandidates(physical,legacy,{limit=48}={}){
  // Rectification occasionally leaves a short strip at a paper corner.
  // Apply the same gate to measured and fallback proposals so the latter
  // cannot resurrect debris that the first stage rejected.
  const measured=(physical||[]).filter(box=>boxArea(box)>0&&!shortFrameDebris(box));
  const accepted=[...measured];
  for(const item of legacy||[]){
    if(!(boxArea(item)>0)||shortFrameDebris(item))continue;
    const midpoint=center(item);
    const explained=accepted.some(carrier=>{
      if(overlapOfSmaller(carrier,item)>.45)return true;
      if(within(carrier,midpoint,.008))return true;
      // Small printed fragments may extend just past their carrier's
      // measured edge. Require horizontal containment and a near edge;
      // proximity alone must never merge two real adjacent materials.
      const small=boxArea(item)<boxArea(carrier)*.25;
      const xInside=midpoint.x>=carrier.x+.01&&midpoint.x<=carrier.x+carrier.w-.01;
      const nearVertical=midpoint.y>=carrier.y-.055&&midpoint.y<=carrier.y+carrier.h+.055;
      return small&&xInside&&nearVertical;
    });
    if(!explained)accepted.push({...item,boundarySource:'unified-uncovered',needsBoundaryReview:true});
  }
  return accepted.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,limit);
}

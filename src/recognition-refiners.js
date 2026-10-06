import {visionTask} from './vision-runtime.js';

async function refineCandidatesWithContourEngine(engine,{candidates,frame,width,height,onProgress=()=>{}}){
  const out=[];let fallback=0;
  for(let index=0;index<candidates.length;index++){
    const candidate=candidates[index],started=performance.now();
    try{
      const refined=await visionTask('refine-candidate',{
        engine,pixels:frame.data,width,height,candidate,paperWidthMM:210,paperHeightMM:297
      });
      out.push(refined||candidate);if(!refined)fallback++;
      onProgress({status:'refinement',engine,completed:index+1,total:candidates.length,elapsedMS:Math.round(performance.now()-started)});
    }catch{
      out.push(candidate);fallback++;
    }
  }
  if(fallback)onProgress({status:'fallback',engine,count:fallback});
  return out;
}
export const refineCandidatesWithHybrid=context=>refineCandidatesWithContourEngine('hybrid',context);
export const refineCandidatesWithActiveContour=context=>refineCandidatesWithContourEngine('active-contour',context);
export const refineCandidatesWithMorphGAC=context=>refineCandidatesWithContourEngine('morphgac',context);
export const refineCandidatesWithGrabCut=context=>refineCandidatesWithContourEngine('grabcut',context);

// Only loaded for the optional browser model. Traditional proposals remain
// available as the explicit fallback when the model rejects an object.
export async function refineCandidatesWithSlimSAM({candidates, frame, width, height, onProgress=()=>{}}) {
  const {refineMaterialsInBrowser} = await import('./slimsam-runtime.js');
  const boxes = candidates.map(candidate => [
    candidate.x * width, candidate.y * height,
    (candidate.x + candidate.w) * width, (candidate.y + candidate.h) * height
  ]);
  const seeds = candidates.map(candidate => {
    const mask = candidate.mask;
    const points = [];
    if (!mask) return points;
    for (const fy of [.25, .5, .75]) for (const fx of [.25, .5, .75]) {
      const x = Math.floor(mask.width * fx), y = Math.floor(mask.height * fy);
      const radius = Math.max(2, Math.round(Math.min(mask.width, mask.height) * .04));
      const inside = [[0,0],[-radius,0],[radius,0],[0,-radius],[0,radius]]
        .every(([dx,dy]) => {
          const xx=x+dx,yy=y+dy;
          return xx>=0&&yy>=0&&xx<mask.width&&yy<mask.height&&mask.alpha[yy*mask.width+xx] > 127;
        });
      if (inside) points.push([(candidate.x+candidate.w*x/mask.width)*width, (candidate.y+candidate.h*y/mask.height)*height]);
    }
    return points;
  });
  const masks = await refineMaterialsInBrowser(frame.data, width, height, boxes, onProgress, seeds);
  const result = [];
  let rejected = 0;
  for (let index = 0; index < candidates.length; index++) {
    const mask = masks[index];
    if (!mask) { result.push(candidates[index]); rejected++; continue; }
    const region = await visionTask('material-mask', {alpha:mask.alpha, width, height});
    if (!region) { result.push(candidates[index]); rejected++; }
    else result.push({...region, modelConfidence:mask.score});
  }
  if (rejected) onProgress({status:'fallback',count:rejected});
  return result;
}

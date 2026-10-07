import {visionTask} from './vision-runtime.js';

// Only loaded for the optional browser model. Traditional proposals remain
// available as the explicit fallback when the model rejects an object.
export async function refineCandidatesWithSlimSAM({candidates, frame, width, height, postprocess=true, onProgress=()=>{}}) {
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
        .every(([dx,dy]) => mask.alpha[(y+dy)*mask.width+x+dx] > 127);
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
  if(!postprocess||!result.length)return result;
  try{return await visionTask('material-boundary-refine',{pixels:frame.data,width,height,candidates:result,mode:'grabcut',postprocess:true});}
  catch{return result;}
}


export async function refineCandidatesWithBrowserContours({candidates,frame,width,height,postprocess=true,onProgress=()=>{},mode='auto'}){
  // Auto spends expensive refinement only on uncertain traditional results.
  // Explicit user-selected engines apply to every candidate.
  const refineAll=mode!=='auto',threshold=.74,selected=[],selectedIndices=[];
  for(let i=0;i<candidates.length;i++){
    if(refineAll||(candidates[i].recognitionConfidence??0)<threshold){selected.push(candidates[i]);selectedIndices.push(i);}
  }
  if(!selected.length)return candidates;
  onProgress({status:'contour-refinement',engine:mode,total:selected.length});
  try{
    const refined=await visionTask('material-boundary-refine',{pixels:frame.data,width,height,candidates:selected,mode,postprocess});
    const out=[...candidates];for(let i=0;i<selectedIndices.length;i++)out[selectedIndices[i]]=refined[i]||selected[i];
    return out;
  }catch(error){
    onProgress({status:'fallback',engine:mode,message:error.message});
    return candidates;
  }
}
export async function refineCandidatesAuto(context){return refineCandidatesWithBrowserContours({...context,mode:'auto'});}
export async function refineCandidatesHybrid(context){return refineCandidatesWithBrowserContours({...context,mode:'hybrid'});}
export async function refineCandidatesWithMorphGAC(context){return refineCandidatesWithBrowserContours({...context,mode:'morphgac'});}
export async function refineCandidatesWithGrabCut(context){return refineCandidatesWithBrowserContours({...context,mode:'grabcut'});}

export async function refineCandidatesWithActiveContour(context){return refineCandidatesWithBrowserContours({...context,mode:'active'});}

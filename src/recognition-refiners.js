import {visionTask} from './vision-runtime.js';

const noPost=Object.freeze({edgePolish:false,shapeRegularization:false,curveSmooth:false,apertures:false});
const hasPost=postprocess=>Object.values(postprocess||{}).some(value=>value!==false);

async function postprocessCandidates({candidates,frame,width,height,preprocess={},postprocess={},onProgress=()=>{},indices=null}){
  if(!candidates.length||!hasPost(postprocess))return candidates;
  const selectedIndices=indices??candidates.map((_,index)=>index);
  if(!selectedIndices.length)return candidates;
  const selected=selectedIndices.map(index=>candidates[index]).filter(Boolean);
  if(!selected.length)return candidates;
  onProgress({status:'boundary-postprocess',total:selected.length});
  try{
    const refined=await visionTask('material-boundary-refine',{
      pixels:frame.data,width,height,candidates:selected,mode:'postprocess',postprocess,
      chromaEdges:preprocess.chromaEdges!==false
    });
    if(selectedIndices.length===candidates.length)return refined;
    const merged=[...candidates];
    for(let i=0;i<selectedIndices.length;i++)merged[selectedIndices[i]]=refined[i]||selected[i];
    return merged;
  }catch(error){
    onProgress({status:'fallback',engine:'postprocess',message:error.message});
    return candidates;
  }
}

// Only loaded for the optional browser model. Traditional proposals remain
// available as the explicit fallback when the model rejects an object.
export async function refineCandidatesWithSlimSAM({candidates,frame,width,height,preprocess={},postprocess={},onProgress=()=>{}}){
  const {refineMaterialsInBrowser}=await import('./slimsam-runtime.js');
  const boxes=candidates.map(candidate=>[
    candidate.x*width,candidate.y*height,
    (candidate.x+candidate.w)*width,(candidate.y+candidate.h)*height
  ]);
  const seeds=candidates.map(candidate=>{
    const mask=candidate.mask,points=[];
    if(!mask)return points;
    for(const fy of [.25,.5,.75])for(const fx of [.25,.5,.75]){
      const x=Math.floor(mask.width*fx),y=Math.floor(mask.height*fy),radius=Math.max(2,Math.round(Math.min(mask.width,mask.height)*.04));
      const inside=[[0,0],[-radius,0],[radius,0],[0,-radius],[0,radius]]
        .every(([dx,dy])=>mask.alpha[(y+dy)*mask.width+x+dx]>127);
      if(inside)points.push([(candidate.x+candidate.w*x/mask.width)*width,(candidate.y+candidate.h*y/mask.height)*height]);
    }
    return points;
  });
  const masks=await refineMaterialsInBrowser(frame.data,width,height,boxes,onProgress,seeds),result=[];
  let rejected=0;
  for(let index=0;index<candidates.length;index++){
    const mask=masks[index];
    if(!mask){result.push(candidates[index]);rejected++;continue;}
    const region=await visionTask('material-mask',{alpha:mask.alpha,width,height});
    if(!region){result.push(candidates[index]);rejected++;}
    else result.push({...candidates[index],...region,modelConfidence:mask.score,edgeMethod:'browser-slimsam'});
  }
  if(rejected)onProgress({status:'fallback',count:rejected});
  return postprocessCandidates({candidates:result,frame,width,height,preprocess,postprocess,onProgress});
}

export async function refineCandidatesWithBrowserContours({candidates,frame,width,height,preprocess={},postprocess={},onProgress=()=>{},mode='auto'}){
  // Recognition and finishing are deliberately separate. Auto spends the
  // expensive contour engine only on uncertain candidates; the enabled
  // finishing stages then see the same resulting masks for every method.
  const refineAll=mode!=='auto',threshold=.70,selected=[],selectedIndices=[];
  for(let i=0;i<candidates.length;i++){
    if(refineAll||(candidates[i].recognitionConfidence??0)<threshold){selected.push(candidates[i]);selectedIndices.push(i);}
  }
  let out=[...candidates];
  if(selected.length){
    onProgress({status:'contour-refinement',engine:mode,total:selected.length});
    try{
      const refined=await visionTask('material-boundary-refine',{
        pixels:frame.data,width,height,candidates:selected,mode,postprocess:noPost,
        chromaEdges:preprocess.chromaEdges!==false
      });
      for(let i=0;i<selectedIndices.length;i++)out[selectedIndices[i]]=refined[i]||selected[i];
    }catch(error){
      onProgress({status:'fallback',engine:mode,message:error.message});
    }
  }
  // In auto mode the fast recognizer has already produced a usable physical
  // boundary (including conservative aperture handling) for confident items.
  // Running the full original-resolution finishing stack for every candidate
  // made one import pay for GrabCut/shape/curve/aperture work repeatedly.
  // Keep confident candidates on the fast path; spend the expensive finishing
  // pass only on candidates that actually needed contour refinement.
  return postprocessCandidates({
    candidates:out,frame,width,height,preprocess,postprocess,onProgress,
    indices:mode==='auto'?selectedIndices:null
  });
}

export async function refineCandidatesPostprocess(context){
  return postprocessCandidates(context);
}
export async function refineCandidatesAuto(context){return refineCandidatesWithBrowserContours({...context,mode:'auto'});}
export async function refineCandidatesHybrid(context){return refineCandidatesWithBrowserContours({...context,mode:'hybrid'});}
export async function refineCandidatesWithMorphGAC(context){return refineCandidatesWithBrowserContours({...context,mode:'morphgac'});}
export async function refineCandidatesWithGrabCut(context){return refineCandidatesWithBrowserContours({...context,mode:'grabcut'});}
export async function refineCandidatesWithActiveContour(context){return refineCandidatesWithBrowserContours({...context,mode:'active'});}

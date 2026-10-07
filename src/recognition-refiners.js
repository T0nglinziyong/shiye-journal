import {visionTask} from './vision-runtime.js';

const noPost=Object.freeze({edgePolish:false,shapeRegularization:false,curveSmooth:false,apertures:false});
const hasPost=postprocess=>Object.values(postprocess||{}).some(value=>value!==false);

async function postprocessCandidates({candidates,frame,width,height,preprocess={},postprocess={},onProgress=()=>{}}){
  if(!candidates.length||!hasPost(postprocess))return candidates;
  onProgress({status:'boundary-postprocess',total:candidates.length});
  try{
    return await visionTask('material-boundary-refine',{
      pixels:frame.data,width,height,candidates,mode:'postprocess',postprocess,
      chromaEdges:preprocess.chromaEdges!==false
    });
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
  const refineAll=mode!=='auto',threshold=.74,selected=[],selectedIndices=[];
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
  return postprocessCandidates({candidates:out,frame,width,height,preprocess,postprocess,onProgress});
}

export async function refineCandidatesPostprocess(context){
  return postprocessCandidates(context);
}
export async function refineCandidatesAuto({
  candidates,frame,width,height,preprocess={},postprocess={},onProgress=()=>{},
  paperWidthMM=210,paperHeightMM=297
}){
  if(!candidates.length)return candidates;
  onProgress({status:'contour-refinement',engine:'morphgac',total:candidates.length});
  let segmented;
  try{
    segmented=await visionTask('segment-boxes-classical',{
      pixels:frame.data,width,height,boxes:candidates,paperWidthMM,paperHeightMM
    });
  }catch(error){
    onProgress({status:'fallback',engine:'morphgac',message:error.message});
    return candidates;
  }

  let shaped=segmented;
  if(postprocess.shapeRegularization!==false){
    onProgress({status:'boundary-postprocess',engine:'shape-regularization',total:segmented.length});
    try{
      shaped=await visionTask('material-boundary-refine',{
        pixels:frame.data,width,height,candidates:segmented,mode:'postprocess',
        postprocess:{edgePolish:false,shapeRegularization:true,curveSmooth:false,apertures:false},
        chromaEdges:preprocess.chromaEdges!==false
      });
    }catch(error){
      onProgress({status:'fallback',engine:'shape-regularization',message:error.message});
      shaped=segmented;
    }
  }

  if(postprocess.apertures===false)return shaped;
  onProgress({status:'boundary-postprocess',engine:'repeated-apertures',total:shaped.length});
  try{
    return await visionTask('restore-repeated-apertures',{
      pixels:frame.data,width,height,candidates:shaped,paperWidthMM,paperHeightMM
    });
  }catch(error){
    onProgress({status:'fallback',engine:'repeated-apertures',message:error.message});
    return shaped;
  }
}
export async function refineCandidatesHybrid(context){return refineCandidatesWithBrowserContours({...context,mode:'hybrid'});}
export async function refineCandidatesWithMorphGAC(context){return refineCandidatesWithBrowserContours({...context,mode:'morphgac'});}
export async function refineCandidatesWithGrabCut(context){return refineCandidatesWithBrowserContours({...context,mode:'grabcut'});}
export async function refineCandidatesWithActiveContour(context){return refineCandidatesWithBrowserContours({...context,mode:'active'});}

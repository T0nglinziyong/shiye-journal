import {visionTask} from './vision-runtime.js';

const noPost=Object.freeze({edgePolish:false,shapeRegularization:false,curveSmooth:false,apertures:false});

async function finalizeCandidates({
  candidates,frame,sourceFrame=frame,width,height,preprocess={},postprocess={},
  onProgress=()=>{},paperWidthMM=210,paperHeightMM=297
}){
  if(!candidates.length)return candidates;
  let out=candidates;

  if(postprocess.shapeRegularization!==false){
    onProgress({status:'boundary-postprocess',engine:'shape-regularization',total:out.length});
    try{
      out=await visionTask('material-boundary-refine',{
        pixels:frame.data,width,height,candidates:out,mode:'postprocess',
        postprocess:{edgePolish:false,shapeRegularization:true,curveSmooth:false,apertures:false},
        chromaEdges:preprocess.chromaEdges!==false
      });
    }catch(error){
      onProgress({status:'fallback',engine:'shape-regularization',message:error.message});
    }
  }

  if(postprocess.apertures===false)return out;
  onProgress({status:'boundary-postprocess',engine:'repeated-apertures',total:out.length});
  try{
    return await visionTask('restore-repeated-apertures',{
      // Aperture colour comparison must use the unmodified source frame even
      // when optional illumination/denoise preprocessing is enabled.
      pixels:sourceFrame.data,width,height,candidates:out,paperWidthMM,paperHeightMM
    });
  }catch(error){
    onProgress({status:'fallback',engine:'repeated-apertures',message:error.message});
    return out;
  }
}

async function refineWithContourMode(context,mode){
  const {
    candidates,frame,width,height,preprocess={},onProgress=()=>{}
  }=context;
  if(!candidates.length)return candidates;
  onProgress({status:'contour-refinement',engine:mode,total:candidates.length});
  let segmented;
  try{
    segmented=await visionTask('material-boundary-refine',{
      pixels:frame.data,width,height,candidates,mode,postprocess:noPost,
      chromaEdges:preprocess.chromaEdges!==false
    });
  }catch(error){
    onProgress({status:'fallback',engine:mode,message:error.message});
    return candidates;
  }
  return finalizeCandidates({...context,candidates:segmented});
}

export async function refineCandidatesPostprocess(context){
  return finalizeCandidates(context);
}

export async function refineCandidatesAuto({
  candidates,frame,width,height,onProgress=()=>{},
  paperWidthMM=210,paperHeightMM=297,...rest
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
  return finalizeCandidates({
    ...rest,candidates:segmented,frame,width,height,onProgress,paperWidthMM,paperHeightMM
  });
}

// Explicit MorphGAC intentionally shares the validated implementation with
// auto. Keeping one implementation prevents the settings page and the import
// path from silently drifting to different parameters.
export async function refineCandidatesWithMorphGAC(context){
  return refineCandidatesAuto(context);
}
export async function refineCandidatesWithGrabCut(context){
  return refineWithContourMode(context,'grabcut');
}
export async function refineCandidatesHybrid(context){
  return refineWithContourMode(context,'hybrid');
}

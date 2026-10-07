import {visionTask} from './vision-runtime.js';

const noPost=Object.freeze({edgePolish:false,shapeRegularization:false,curveSmooth:false,apertures:false});
const hasPost=postprocess=>Object.values(postprocess||{}).some(value=>value!==false);

const expandBoxForSegmentation=(candidate,marginMM,paperWidthMM,paperHeightMM)=>{
  const dx=marginMM/paperWidthMM,dy=marginMM/paperHeightMM,
    x0=Math.max(0,candidate.x-dx),y0=Math.max(0,candidate.y-dy),
    x1=Math.min(1,candidate.x+candidate.w+dx),y1=Math.min(1,candidate.y+candidate.h+dy);
  return {
    ...candidate,
    identityX:candidate.x,identityY:candidate.y,identityW:candidate.w,identityH:candidate.h,
    x:x0,y:y0,w:x1-x0,h:y1-y0,
    // Auto segmentation must start from the detected rectangle itself rather
    // than from a previously guessed alpha mask.
    mask:undefined
  };
};


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
  candidates,frame,width,height,preprocess={},onProgress=()=>{},
  paperWidthMM=210,paperHeightMM=297
}){
  if(!candidates.length)return candidates;
  const initialized=candidates.map(candidate=>expandBoxForSegmentation(candidate,4,paperWidthMM,paperHeightMM));
  onProgress({status:'contour-refinement',engine:'morphgac',total:initialized.length});
  try{
    return await visionTask('material-boundary-refine',{
      pixels:frame.data,width,height,candidates:initialized,
      mode:'morphgac',postprocess:noPost,
      chromaEdges:preprocess.chromaEdges!==false,
      paperWidthMM,paperHeightMM,
      roiPadMM:4,morphMaxDim:180,morphIterations:65,morphBalloon:-1
    });
  }catch(error){
    onProgress({status:'fallback',engine:'morphgac',message:error.message});
    return candidates;
  }
}
export async function refineCandidatesHybrid(context){return refineCandidatesWithBrowserContours({...context,mode:'hybrid'});}
export async function refineCandidatesWithMorphGAC(context){return refineCandidatesWithBrowserContours({...context,mode:'morphgac'});}
export async function refineCandidatesWithGrabCut(context){return refineCandidatesWithBrowserContours({...context,mode:'grabcut'});}
export async function refineCandidatesWithActiveContour(context){return refineCandidatesWithBrowserContours({...context,mode:'active'});}

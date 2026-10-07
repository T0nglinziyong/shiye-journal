import {visionTask,visionParallelTasks,visionParallelism} from './vision-runtime.js';

const chunks=(items,count)=>{
  const out=Array.from({length:Math.min(count,items.length)},()=>[]);
  items.forEach((item,i)=>out[i%out.length].push(item));
  return out.filter(Boolean).filter(group=>group.length);
};

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
    }catch(error){onProgress({status:'fallback',engine:'shape-regularization',message:error.message});}
  }
  if(postprocess.apertures===false)return out;
  onProgress({status:'boundary-postprocess',engine:'repeated-apertures',total:out.length});
  try{
    return await visionTask('restore-repeated-apertures',{
      pixels:sourceFrame.data,width,height,candidates:out,paperWidthMM,paperHeightMM
    });
  }catch(error){
    onProgress({status:'fallback',engine:'repeated-apertures',message:error.message});
    return out;
  }
}

async function parallelFinalPipeline({
  candidates,frame,sourceFrame=frame,width,height,preprocess={},postprocess={},
  onProgress=()=>{},paperWidthMM=210,paperHeightMM=297,method='morphgac'
}){
  if(!candidates.length)return candidates;
  const groups=chunks(candidates,Math.min(visionParallelism(),candidates.length));
  onProgress({status:'contour-refinement',engine:method,total:candidates.length});
  try{
    const results=await visionParallelTasks('process-material-boxes',groups.map(boxes=>({
      // One frame copy per worker/chunk, never one copy per material.
      pixels:new Uint8ClampedArray(frame.data),
      sourcePixels:new Uint8ClampedArray(sourceFrame.data),
      transferInput:true,
      width,height,boxes,method,paperWidthMM,paperHeightMM,
      chromaEdges:preprocess.chromaEdges!==false,
      shapeRegularization:postprocess.shapeRegularization!==false,
      apertures:postprocess.apertures!==false
    })));
    return results.flat().sort((a,b)=>a.y-b.y||a.x-b.x);
  }catch(error){
    onProgress({status:'fallback',engine:method,message:error.message});
    return candidates;
  }
}

export async function refineCandidatesAuto(context){
  return parallelFinalPipeline({...context,method:'morphgac'});
}
export async function refineCandidatesWithMorphGAC(context){
  return parallelFinalPipeline({...context,method:'morphgac'});
}
export async function refineCandidatesWithGrabCut(context){
  return parallelFinalPipeline({...context,method:'grabcut'});
}
export async function refineCandidatesHybrid(context){
  return parallelFinalPipeline({...context,method:'hybrid'});
}
export async function refineCandidatesPostprocess(context){
  return finalizeCandidates(context);
}

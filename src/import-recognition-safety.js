import {detectPaperCandidates} from './image.js';
import {analysisPixels} from './recognition-raster.js';
import {segmentPaperMaterials} from './paper-analysis.js';
import {neutralizePaperChroma} from './paper-chroma-preprocess.js';

// The recognition profile refines boundaries, not material identities. A
// worker returning [] (or dropping some boxes) must never erase the objects
// that the whole-page discovery stage has already found.
export function preserveDiscoveredCandidates(refined,discovered){
  if(!Array.isArray(discovered)||!discovered.length)return Array.isArray(refined)?refined:[];
  if(!Array.isArray(refined))refined=[];
  if(refined.length===discovered.length)return refined;
  const available=new Set(refined.map((_,i)=>i));
  const intersection=(a,b)=>{
    const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);
    const w=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-x);
    const h=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-y);
    const common=w*h,union=a.w*a.h+b.w*b.h-common;
    return union>0?common/union:0;
  };
  return discovered.map(raw=>{
    let best=-1,score=0;
    for(const i of available){
      const candidate=refined[i];
      const iou=intersection(raw,candidate);
      if(iou>score){score=iou;best=i;}
    }
    if(best>=0&&score>=.45){
      available.delete(best);
      return refined[best];
    }
    // A rectangular source cut is intentionally marked as needing review.
    // No invented alpha mask is substituted for failed segmentation.
    return {...raw,recognitionFallback:true};
  });
}

export async function detectImportRegions(bitmap,box,options={},{
  detect=detectPaperCandidates,analyze=analysisPixels,
  discover=segmentPaperMaterials,neutralize=neutralizePaperChroma,
  onRecovery=()=>{}
}={}){
  let discovery=null,detected=[],failure=null;
  const originalDiagnostic=options.onDiagnostic;
  try{
    detected=await detect(bitmap,box,6,{
      ...options,
      onDiagnostic:trace=>{
        if(trace?.phase==='boxes')discovery=trace;
        originalDiagnostic?.(trace);
      }
    });
  }catch(error){failure=error;}
  if(!failure&&Array.isArray(detected)&&
     (!discovery||detected.length>=discovery.count))return detected;
  if(!discovery?.count){
    if(failure)throw failure;
    return Array.isArray(detected)?detected:[];
  }
  try{
    // The box-stage diagnostic already contains the exact discovered
    // identities; reuse them rather than running a second full-page OpenCV
    // discovery that might fail again on an underpowered phone.
    if(Array.isArray(discovery.boxes)&&discovery.boxes.length===discovery.count){
      const rescued=preserveDiscoveredCandidates(detected,discovery.boxes);
      if(rescued.length){
        onRecovery({discovered:discovery.count,refined:detected?.length||0,
          recovered:rescued.filter(item=>item.recognitionFallback).length,
          cause:failure?.message||'refiner dropped detected boxes'});
        return rescued;
      }
    }
    const ratio=Math.min(1,900/Math.max(bitmap.width*box.w,bitmap.height*box.h));
    const width=Math.max(1,Math.round(bitmap.width*box.w*ratio));
    const height=Math.max(1,Math.round(bitmap.height*box.h*ratio));
    const pixels=await analyze(bitmap,box,width,height);
    const frame={data:options.paperRectified?neutralize(pixels,width,height):pixels,width,height};
    const raw=await discover(frame,{
      smallestMM:6,paperWidthMM:options.paperWidthMM,
      paperHeightMM:options.paperHeightMM,sourcePixels:frame.data,
      chromaEdges:options.recognitionPreprocess?.chromaEdges!==false,
      mergeSharedCarrier:options.mergeSharedCarrier!==false
    });
    const rescued=preserveDiscoveredCandidates(detected,raw);
    if(rescued.length){
      onRecovery({discovered:raw.length,refined:detected?.length||0,
        recovered:rescued.filter(item=>item.recognitionFallback).length,
        cause:failure?.message||'refiner dropped detected boxes'});
      return rescued;
    }
  }catch(recoveryError){
    console.warn('识别候选框恢复失败',recoveryError);
  }
  if(failure)throw failure;
  return Array.isArray(detected)?detected:[];
}

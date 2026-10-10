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

// This adapter is intentionally dependency-injected: it never runs a new CV
// algorithm. Reuse the boxes emitted by c6's unchanged discovery stage if a
// later boundary/mask worker drops them. The caller supplies the stable
// detectPaperCandidates function, so there is no second rescan or hidden
// image normalization in this module.
export async function detectImportRegions(bitmap,box,options={},{
  detect,onRecovery=()=>{}
}={}){
  if(typeof detect!=='function')throw Error('缺少素材识别器');
  let discovery=null,refined=[],failure=null;
  try{
    refined=await detect(bitmap,box,6,{
      ...options,
      onDiagnostic:trace=>{
        if(trace?.phase==='boxes')discovery=trace;
        options.onDiagnostic?.(trace);
      }
    });
  }catch(error){failure=error;}
  const candidates=Array.isArray(refined)?refined:[];
  const discovered=Array.isArray(discovery?.boxes)?discovery.boxes:[];
  if(discovered.length>candidates.length){
    const rescued=preserveDiscoveredCandidates(candidates,discovered);
    onRecovery({
      discovered:discovered.length,
      refined:candidates.length,
      recovered:rescued.filter(item=>item.recognitionFallback).length,
      cause:failure?.message||'refiner dropped detected boxes'
    });
    return rescued;
  }
  if(failure)throw failure;
  return candidates;
}

import {visionTask} from './vision-runtime.js';
import {buildForegroundEvidence} from './foreground-evidence.js';
import {attachBoundaryHints} from './recognition-boundary-hints.js';

// Instance-first recognition contract:
//
// 1. page-connected foreground decides material identities;
// 2. connected components decide the count exactly once;
// 3. structural enclosures may improve ONE identity's rough boundary;
// 4. an exceptional per-instance completion pass may refine a high-fill item
//    at the rectified page edge;
// 5. no later stage may create, delete, split, or merge identities.
//
// Exact alpha finishing is handled after this function by the recognition
// profile. This function is responsible for stable identity + rough carrier.
export async function segmentPaperMaterials({data,width:w,height:h},{smallestMM=6,paperWidthMM=210,paperHeightMM=297,sourcePixels=data,chromaEdges=true,postprocess={}}={}) {
  const pxPerMM=((w/paperWidthMM)+(h/paperHeightMM))/2,
    cellSize=Math.max(24,Math.round(pxPerMM*13.5)),
    evidence=buildForegroundEvidence(data,w,h,{sourcePixels,cellSize});

  const [instances,structural]=await Promise.all([
    visionTask('instances-simple',{
      mask:evidence.mask,evidence:evidence.evidence,foregroundSeeds:evidence.foregroundSeeds,
      width:w,height:h,smallestMM,paperWidthMM,paperHeightMM
    }),
    visionTask('enclosures',{
      // Structural contours are boundary hints only. They never participate in
      // identity/count decisions.
      pixels:data,evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
      shadowLikelihood:evidence.shadowLikelihood,score:evidence.score,
      width:w,height:h,smallestMM,paperWidthMM,paperHeightMM,chromaEdges,postprocess
    })
  ]);

  let candidates=attachBoundaryHints(instances,structural);

  // Rare local fallback: a substantial, high-fill identity that reaches the
  // rectified page edge can lose part of its outer boundary to the protected
  // frame. Complete that ONE identity in isolation. Low-fill/freeform items
  // (for example printed content on a white carrier) never enter this rule.
  for(let index=0;index<candidates.length;index++){
    const candidate=candidates[index],
      fill=candidate.identityFillRatio??candidate.fillRatio??0,
      needsCompletion=!candidate.boundaryHint
        &&candidate.touchesProtectedFrame===true
        &&fill>=.70;
    if(!needsCompletion)continue;
    const completed=await visionTask('complete-boundaries',{
      pixels:sourcePixels,width:w,height:h,candidates:[candidate],
      smallestMM,paperWidthMM,paperHeightMM,
      evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
      shadowLikelihood:evidence.shadowLikelihood,chromaEdges,postprocess
    });
    if(completed?.[0]){
      candidates[index]={
        ...completed[0],
        boundaryFinalized:true,
        boundaryCompletion:'frame-high-fill'
      };
    }
  }

  return candidates.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
}

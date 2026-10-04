import {visionTask} from './vision-runtime.js';
import {buildForegroundEvidence} from './foreground-evidence.js';
import {fuseRecognitionCandidates} from './recognition-fusion.js';

// Recognition is intentionally staged:
// 1) page-connected background gives a conservative physical foreground;
// 2) marker-controlled watershed discovers material instances;
// 3) closed paper-contact boundaries may refine/merge those instances;
// 4) GrabCut inside the watershed stage refines the final alpha.
// Structural contours are never free-standing "every closed shape is an item"
// proposals unless they satisfy the much stricter missing-instance rule.
export async function segmentPaperMaterials({data,width:w,height:h},{smallestMM=6,paperWidthMM=210,paperHeightMM=297,sourcePixels=data}={}) {
  const evidence=buildForegroundEvidence(data,w,h,{sourcePixels});
  const [instances,structural]=await Promise.all([
    visionTask('instances',{
      mask:evidence.mask,evidence:evidence.evidence,foregroundSeeds:evidence.foregroundSeeds,
      shadowLikelihood:evidence.shadowLikelihood,pixels:sourcePixels,
      width:w,height:h,smallestMM,paperWidthMM,paperHeightMM
    }),
    visionTask('enclosures',{
      pixels:sourcePixels,evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
      shadowLikelihood:evidence.shadowLikelihood,score:evidence.score,
      width:w,height:h,smallestMM,paperWidthMM,paperHeightMM
    })
  ]);
  const fused=fuseRecognitionCandidates(instances,structural);
  const completed=fused.length?await visionTask('complete-boundaries',{pixels:sourcePixels,width:w,height:h,candidates:fused}):fused;
  return completed.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
}

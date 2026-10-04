import {visionTask} from './vision-runtime.js';
import {buildForegroundEvidence} from './foreground-evidence.js';
import {splitThinBridges} from './thin-bridge.js';
import {fuseRecognitionCandidates} from './recognition-fusion.js';

// Material discovery stays deliberately local: analyse a reduced paper image,
// use robust Lab evidence to find physical candidates, then let OpenCV refine
// geometry. Accepted candidates are later re-extracted from the full source.
export async function segmentPaperMaterials({data,width:w,height:h},{smallestMM=6,paperWidthMM=210,paperHeightMM=297,sourcePixels=data}={}) {
  const evidence=buildForegroundEvidence(data,w,h,{sourcePixels});
  const [colourRaw,structural]=await Promise.all([
    visionTask('components',{
      mask:evidence.mask,
      evidence:evidence.evidence,
      foregroundSeeds:evidence.foregroundSeeds,
      shadowLikelihood:evidence.shadowLikelihood,
      pixels:sourcePixels,
      width:w,height:h,smallestMM,paperWidthMM,paperHeightMM
    }),
    visionTask('enclosures',{
      pixels:sourcePixels,evidence:evidence.evidence,shadowLikelihood:evidence.shadowLikelihood,score:evidence.score,
      width:w,height:h,smallestMM,paperWidthMM,paperHeightMM
    })
  ]);
  const colour=splitThinBridges(colourRaw,{analysisWidth:w,analysisHeight:h,evidence:evidence.evidence,shadowLikelihood:evidence.shadowLikelihood,smallestMM,paperWidthMM,paperHeightMM});
  let candidates=fuseRecognitionCandidates(colour,structural);
  // Exact containment is a physical hierarchy decision, not a colour decision.
  // Keep the enclosing material and discard a wholly internal duplicate.
  candidates=candidates.filter((a,i)=>!candidates.some((b,j)=>i!==j&&a.x>=b.x&&a.y>=b.y&&a.x+a.w<=b.x+b.w&&a.y+a.h<=b.y+b.h&&a.w*a.h<b.w*b.h*.92));
  return candidates.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
}

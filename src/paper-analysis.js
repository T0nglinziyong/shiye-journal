import {visionTask} from './vision-runtime.js';
import {buildForegroundEvidence} from './foreground-evidence.js';

// Default recognition is deliberately split into two responsibilities:
//
// 1. full-page classical CV discovers material boxes and decides the count;
// 2. the recognition profile refines each box into an alpha mask.
//
// No boundary engine in this module may create, delete, split or merge an
// identity. This keeps box detection independently testable from segmentation.
export async function segmentPaperMaterials(
  {data,width:w,height:h},
  {smallestMM=6,paperWidthMM=210,paperHeightMM=297,sourcePixels=data}={}
) {
  const pxPerMM=((w/paperWidthMM)+(h/paperHeightMM))/2,
    cellSize=Math.max(24,Math.round(pxPerMM*13.5));

  // Box discovery intentionally uses the rectified source pixels directly.
  // The three real-case benchmark showed that illumination/contrast
  // preprocessing did not improve box recall and roughly doubled runtime.
  const evidence=buildForegroundEvidence(sourcePixels,w,h,{sourcePixels,cellSize});

  return visionTask('instances-simple',{
    mask:evidence.mask,
    evidence:evidence.evidence,
    foregroundSeeds:evidence.foregroundSeeds,
    width:w,height:h,
    smallestMM,paperWidthMM,paperHeightMM
  });
}

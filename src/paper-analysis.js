import {visionTask} from './vision-runtime.js';
import {buildForegroundEvidence} from './foreground-evidence.js';

// Whole-page recognition stage: discover material identities/boxes only.
//
// The default pipeline is intentionally separated:
//   1) this module decides WHERE/HOW MANY from the full rectified image;
//   2) the recognition profile segments each returned box independently.
//
// No boundary segmenter is allowed to create/delete/merge identities here.
export async function segmentPaperMaterials({data,width:w,height:h},{
  smallestMM=6,paperWidthMM=210,paperHeightMM=297,sourcePixels=data,chromaEdges=true,mergeSharedCarrier=true,candidateDiscovery='legacy'
}={}){
  // Real-case ablation showed that box discovery is more accurate and roughly
  // twice as fast on the original rectified RGB than on illumination/CLAHE/
  // denoise preprocessing. Keep Lab chroma evidence, but do not alter pixels.
  const pixels=sourcePixels||data,
    pxPerMM=((w/paperWidthMM)+(h/paperHeightMM))/2,
    cellSize=Math.max(24,Math.round(pxPerMM*13.5)),
    evidence=buildForegroundEvidence(pixels,w,h,{sourcePixels:pixels,cellSize,useChroma:chromaEdges!==false,paperWidthMM,paperHeightMM});

  const opts={mask:evidence.mask,evidence:evidence.evidence,
    foregroundSeeds:evidence.foregroundSeeds,width:w,height:h,
    smallestMM:candidateDiscovery==='unified'||candidateDiscovery==='research'?9:smallestMM,paperWidthMM,paperHeightMM,mergeSharedCarrier};
  const legacy=await visionTask('boxes-simple',opts);
  if(candidateDiscovery==='unified'||candidateDiscovery==='research')return visionTask('boxes-research',{
    ...opts,pixels:new Uint8ClampedArray(pixels),legacyBoxes:legacy
  });
  if(candidateDiscovery!=='physical')return legacy.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
  // Preserve the old detector as an uncovered-object fallback, but only in
  // the explicitly selected physical-discovery path.
  const physical=await visionTask('boxes-physical',{
    ...opts,pixels:new Uint8ClampedArray(pixels),legacyBoxes:legacy,
    separateSupportedCarriers:false
  });
  return physical.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
}

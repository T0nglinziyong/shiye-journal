import {visionTask} from './vision-runtime.js';
import {buildForegroundEvidence} from './foreground-evidence.js';
import {fuseRecognitionCandidates} from './recognition-fusion.js';
import {assessFastRecognition,fastCandidateForFusion,reconcileInstancesWithFastAnchors} from './recognition-quality.js';

// Recognition is intentionally staged:
// 1) page-connected background gives a conservative physical foreground;
// 2) marker-controlled watershed discovers material instances;
// 3) closed paper-contact boundaries may refine/merge those instances;
// 4) GrabCut inside the watershed stage refines the final alpha.
// Structural contours are never free-standing "every closed shape is an item"
// proposals unless they satisfy the much stricter missing-instance rule.
export async function segmentPaperMaterials({data,width:w,height:h},{smallestMM=6,paperWidthMM=210,paperHeightMM=297,sourcePixels=data,chromaEdges=true,postprocess={}}={}) {
  // Express background-grid scale in physical paper units so fast/standard/
  // detail profiles see the same scene rather than three different algorithms.
  const pxPerMM=((w/paperWidthMM)+(h/paperHeightMM))/2,cellSize=Math.max(24,Math.round(pxPerMM*13.5));
  const evidence=buildForegroundEvidence(data,w,h,{sourcePixels,cellSize});
  // Normal journal pages (a handful of materials) should finish in one shared
  // OpenCV worker pass. The legacy staged recognizer remains a correctness
  // fallback for unusual scenes where the fast pass is uncertain.
  const fast=await visionTask('materials-fast',{
    pixels:data,width:w,height:h,smallestMM,paperWidthMM,paperHeightMM,
    evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
    shadowLikelihood:evidence.shadowLikelihood,score:evidence.score,rectified:true,chromaEdges,
    postprocess:{shapeRegularization:false,curveSmooth:false,apertures:postprocess?.apertures!==false}
  });
  const fastAssessment=assessFastRecognition(fast,{foregroundSeeds:evidence.foregroundSeeds,width:w,height:h});
  if(fastAssessment.reliable){
    return fast.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
  }
  const [instances,structural]=await Promise.all([
    visionTask('instances',{
      mask:evidence.mask,evidence:evidence.evidence,foregroundSeeds:evidence.foregroundSeeds,
      shadowLikelihood:evidence.shadowLikelihood,pixels:sourcePixels,
      width:w,height:h,smallestMM,paperWidthMM,paperHeightMM,chromaEdges,postprocess
    }),
    visionTask('enclosures',{
      // Boundary discovery uses the working (optionally illumination-balanced)
      // page. The final topology/crop still uses sourcePixels, so lighting
      // normalization can reveal edges without changing saved material colour.
      pixels:data,evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
      shadowLikelihood:evidence.shadowLikelihood,score:evidence.score,
      width:w,height:h,smallestMM,paperWidthMM,paperHeightMM,chromaEdges,postprocess
    })
  ]);
  const anchored=reconcileInstancesWithFastAnchors(instances,fast);
  const reconstructed=anchored.instances.length?await visionTask('boundary-reconstruction',{
    pixels:data,instances:anchored.instances,evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,
    shadowLikelihood:evidence.shadowLikelihood,score:evidence.score,
    width:w,height:h,smallestMM,paperWidthMM,paperHeightMM,chromaEdges,postprocess
  }):[];
  // Suspicious fast scenes still contain useful physical boundaries (notably
  // recovered white die-cut carriers). Fast identity anchors also split a
  // watershed region when independent positive material evidence proves that
  // it actually contains multiple physical items.
  const trustedFast=fast.filter(fastCandidateForFusion);
  const fused=fuseRecognitionCandidates(anchored.instances,[...trustedFast,...structural,...reconstructed]);
  const completed=fused.length?await visionTask('complete-boundaries',{
    pixels:sourcePixels,width:w,height:h,candidates:fused,smallestMM,paperWidthMM,paperHeightMM,
    evidence:evidence.evidence,backgroundConnected:evidence.backgroundConnected,shadowLikelihood:evidence.shadowLikelihood,chromaEdges,postprocess
  }):fused;
  return completed.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
}

import {visionTask} from './vision-runtime.js';
import {buildForegroundEvidence} from './foreground-evidence.js';
import {instanceRefinementPlan} from './recognition-instance-refinement.js';

// Default recognition is deliberately instance-first and local:
//
// 1. page-connected foreground decides material identities;
// 2. connected components decide the count exactly once;
// 3. each identity may receive AT MOST one local boundary refinement;
// 4. no later stage may create, delete, split, or merge identities.
//
// Expensive contour engines remain available as explicit user-selected quality
// modes, but the default path contains no full-page enclosure/reconstruction/
// fusion competition.
export async function segmentPaperMaterials({data,width:w,height:h},{smallestMM=6,paperWidthMM=210,paperHeightMM=297,sourcePixels=data,chromaEdges=true,postprocess={}}={}) {
  const pxPerMM=((w/paperWidthMM)+(h/paperHeightMM))/2,
    cellSize=Math.max(24,Math.round(pxPerMM*13.5)),
    evidence=buildForegroundEvidence(data,w,h,{sourcePixels,cellSize});

  const instances=await visionTask('instances-simple',{
    mask:evidence.mask,evidence:evidence.evidence,foregroundSeeds:evidence.foregroundSeeds,
    width:w,height:h,smallestMM,paperWidthMM,paperHeightMM
  });

  const candidates=[...instances];
  for(let index=0;index<candidates.length;index++){
    const candidate=candidates[index],plan=instanceRefinementPlan(candidate);
    if(!plan)continue;

    if(plan.kind==='grabcut'){
      const recovered=await visionTask('carrier-grabcut',{
        pixels:sourcePixels,width:w,height:h,candidate,
        paperWidthMM,paperHeightMM,padMM:plan.padMM,reason:plan.reason
      });
      if(recovered)candidates[index]=recovered;
      continue;
    }

    if(plan.kind==='complete'){
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
          boundaryCompletion:plan.reason
        };
      }
    }
  }

  return candidates.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,48);
}

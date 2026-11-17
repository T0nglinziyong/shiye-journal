import {paperDimensions} from './paper-sizes.js';
import {recommendForDirection,buildMaterialScope,diversifyRecommendations,normalizeRecommendationDirection} from './matching-materials.js';
import {styleGroups,purposeGroups,selectedDirections} from './matching-directions.js';
import {creationGuidanceRoute} from './creation-guidance.js';

export function matchingRecommendations(state,direction='全部'){return recommendForDirection({assets:state.assets,basket:state.basket,styles:selectedDirections(styleGroups,state.matchStyles||[]),purposes:selectedDirections(purposeGroups,state.matchPurposes||[]),excluded:state.excludedAssetIDs||[],intent:state.matchIntent,pageSize:paperDimensions(state.matchRatio),direction});}
// One bounded scope for UI, API creation and exported ZIPs.
export function matchingScopeForState(state,ranked=matchingRecommendations(state)){
 const recommendations=ranked.slice(0,18);
 const automaticPresets=state.aiSettings.autoUsePresets===true?diversifyRecommendations(
  ranked.filter(row=>row.asset.isCreativePreset),{limit:6,perKind:2}):[];
 const automaticIDs=new Set(automaticPresets.map(row=>row.asset.id));
 return buildMaterialScope({basket:state.basket,coreIDs:state.coreIDs,
  recommendations:recommendations.filter(row=>!automaticIDs.has(row.asset.id)),automaticPresets,
  excluded:state.excludedAssetIDs,autoIncludeRecommendations:state.aiSettings.autoIncludeRecommendations,
  requireAllCandidates:state.aiSettings.requireAllCandidates});
}
export function matchingViewModel(state){
  const selected=state.basket.map(id=>state.assets.find(a=>a.id===id)).filter(Boolean);
  const ranked=matchingRecommendations(state),recommendations=ranked.slice(0,18),excluded=new Set(state.excludedAssetIDs||[]);
  const scope=matchingScopeForState(state,ranked);
  const direction=normalizeRecommendationDirection(state.recommendFilter);
  const filtered=direction==='不使用'?[...excluded].map(id=>state.assets.find(a=>a.id===id)).filter(Boolean).map(asset=>({asset,reasons:['已排除']})):direction==='全部'?ranked.slice(0,18):matchingRecommendations(state,direction).slice(0,18);
  const styles=selectedDirections(styleGroups,state.matchStyles||[]),chosenPurposes=selectedDirections(purposeGroups,state.matchPurposes||[]);
  const guidance=creationGuidanceRoute({styles,pageMode:state.matchMode,purposes:chosenPurposes,contentPolicy:state.matchContentPolicy,intent:state.matchIntent,materials:state.assets.filter(asset=>scope.candidateAssetIDs.includes(asset.id))});
  return {selected,recommendations,excluded,scope,filtered,styles,chosenPurposes,guidance};
}

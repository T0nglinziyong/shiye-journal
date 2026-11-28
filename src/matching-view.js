import {paperDimensions} from './paper-sizes.js';
import {scoreRecommendationCandidates,rankRecommendationCandidates,buildMaterialScope,diversifyRecommendations,normalizeRecommendationDirection} from './matching-materials.js';
import {styleGroups,purposeGroups,selectedDirections} from './matching-directions.js';
import {creationGuidanceRoute} from './creation-guidance.js';
import {isCurrentBuiltinMaterial} from './legacy-builtins.js';

const recommendationCache=new WeakMap();
const recommendationFields=['id','updatedAt','title','kind','kindDetail','role','secondaryRoles','contentCategories','layoutFits','tags','contentTags','themeTags','styleTags','colorTags','materialTags','moodTags','palette','semanticColorNames','physicalWidthMM','physicalHeightMM','seriesID','reviewStatus','autoOrganized','usageStatus','isProjectInternal','isCreativePreset','isBuiltinMaterial'];
function rankingForState(state,direction='全部'){
 const styles=selectedDirections(styleGroups,state.matchStyles||[]),purposes=selectedDirections(purposeGroups,state.matchPurposes||[]);
 const key=JSON.stringify([state.assets.map(asset=>recommendationFields.map(field=>asset[field])),state.basket,state.excludedAssetIDs,styles,purposes,state.matchIntent,state.matchRatio,state.matchMode]);
 let cached=recommendationCache.get(state);
 if(cached?.key!==key){
  const paper=paperDimensions(state.matchRatio);
  cached={key,scored:scoreRecommendationCandidates({assets:state.assets,basket:state.basket,
   styles,purposes,excluded:state.excludedAssetIDs||[],intent:state.matchIntent,
   pageSize:paper?{...paper,width:paper.width*(state.matchMode==='spread'?2:1)}:null}),rankings:new Map()};
  recommendationCache.set(state,cached);
 }
 const mode=normalizeRecommendationDirection(direction);
 if(!cached.rankings.has(mode))cached.rankings.set(mode,rankRecommendationCandidates(cached.scored,mode));
 return cached.rankings.get(mode);
}
export function matchingRecommendations(state,direction='全部'){return rankingForState(state,direction);}
// One bounded scope for UI, API creation and exported ZIPs.
export function matchingScopeForState(state,ranked=matchingRecommendations(state)){
 const validIDs=new Set(state.assets.filter(asset=>!asset.isProjectInternal).map(asset=>asset.id));
 const basket=state.basket.filter(id=>validIDs.has(id));
 const recommendations=ranked.slice(0,18);
 const automaticPresets=state.aiSettings.autoUsePresets===true?diversifyRecommendations(
  ranked.filter(row=>row.asset.isCreativePreset),{limit:6,perKind:2}):[];
 const automaticIDs=new Set(automaticPresets.map(row=>row.asset.id));
 return buildMaterialScope({basket,coreIDs:state.coreIDs,
  recommendations:recommendations.filter(row=>!automaticIDs.has(row.asset.id)&&!row.asset.isCreativePreset&&!isCurrentBuiltinMaterial(row.asset)),automaticPresets,
  excluded:state.excludedAssetIDs,autoIncludeRecommendations:state.aiSettings.autoIncludeRecommendations,
  requireAllCandidates:state.aiSettings.requireAllCandidates});
}
export function matchingViewModel(state){
  const assetsByID=new Map(state.assets.map(asset=>[asset.id,asset]));
  const selected=state.basket.map(id=>assetsByID.get(id)).filter(Boolean);
  const ranked=matchingRecommendations(state),recommendations=ranked.slice(0,18),excluded=new Set(state.excludedAssetIDs||[]);
  const scope=matchingScopeForState(state,ranked);
  const direction=normalizeRecommendationDirection(state.recommendFilter);
  const filtered=direction==='不使用'?[...excluded].map(id=>assetsByID.get(id)).filter(Boolean).map(asset=>({asset,reasons:['已排除']})):matchingRecommendations(state,direction).slice(0,18);
  const styles=selectedDirections(styleGroups,state.matchStyles||[]),chosenPurposes=selectedDirections(purposeGroups,state.matchPurposes||[]);
  const guidance=creationGuidanceRoute({styles,pageMode:state.matchMode,purposes:chosenPurposes,contentPolicy:state.matchContentPolicy,intent:state.matchIntent,materials:scope.candidateAssetIDs.map(id=>assetsByID.get(id)).filter(Boolean)});
  return {selected,recommendations,excluded,scope,filtered,styles,chosenPurposes,guidance};
}

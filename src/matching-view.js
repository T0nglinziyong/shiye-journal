import {recommendForDirection,buildMaterialScope} from './matching-materials.js';
import {styleGroups,purposeGroups,selectedDirections} from './matching-directions.js';
import {creationGuidanceRoute} from './creation-guidance.js';

const matched=(item,filter,selected)=>{
  if(filter==='全部')return true;
  if(filter==='不使用')return false;
  if(filter==='同系列')return selected.some(a=>a.seriesID&&a.seriesID===item.asset.seriesID);
  if(filter==='材质')return selected.some(a=>a.texture&&a.texture===item.asset.texture);
  if(filter==='结构补足')return item.reasons.includes('结构补足');
  if(filter==='尺寸层次')return item.reasons.includes('尺寸层次');
  if(filter==='内容呼应')return item.reasons.some(r=>/主题|风格|素材/.test(r));
  return item.reasons.includes('配色关系');
};
export function matchingRecommendations(state){return recommendForDirection({assets:state.assets,basket:state.basket,styles:selectedDirections(styleGroups,state.matchStyles||[]),purposes:selectedDirections(purposeGroups,state.matchPurposes||[]),excluded:state.excludedAssetIDs||[]});}
export function matchingViewModel(state){
  const selected=state.basket.map(id=>state.assets.find(a=>a.id===id)).filter(Boolean);
  const ranked=matchingRecommendations(state),recommendations=ranked.slice(0,18),excluded=new Set(state.excludedAssetIDs||[]);
  const scope=buildMaterialScope({basket:state.basket,coreIDs:state.coreIDs,recommendations,excluded:state.excludedAssetIDs,autoIncludeRecommendations:state.aiSettings.autoIncludeRecommendations,requireAllCandidates:state.aiSettings.requireAllCandidates});
  const filtered=state.recommendFilter==='不使用'?[...excluded].map(id=>state.assets.find(a=>a.id===id)).filter(Boolean).map(asset=>({asset,reasons:['已排除']})):ranked.filter(r=>matched(r,state.recommendFilter,selected)).slice(0,18);
  const styles=selectedDirections(styleGroups,state.matchStyles||[]),chosenPurposes=selectedDirections(purposeGroups,state.matchPurposes||[]);
  const guidance=creationGuidanceRoute({styles,purposes:chosenPurposes,contentPolicy:state.matchContentPolicy,intent:state.matchIntent,materials:state.assets.filter(asset=>scope.candidateAssetIDs.includes(asset.id))});
  return {selected,recommendations,excluded,scope,filtered,styles,chosenPurposes,guidance};
}

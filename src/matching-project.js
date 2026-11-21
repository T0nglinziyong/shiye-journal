import {project,physicalPlacement} from './domain.js';

export function matchingCreationProject(state,scope,selectedIDs,automatic=true){
  const mode=automatic?(state.matchMode==='spread'?'spread':'single'):'spread';
  const p=project('新的手账',{mode,ratio:state.matchRatio||'a4',style:state.matchStyle||'随材而定'}),d=p.drafts[0];
  if(!automatic){
    d.matchingTwoPageWorkspace=true;
    d.inactivePageDimmed=state.matchMode==='single';
    d.items=physicalPlacement(d,state.assets,selectedIDs.slice(0,8));
  }
  p.candidateAssetIDs=automatic?scope.candidateAssetIDs:selectedIDs;
  p.materialPriority=automatic?scope:{...scope,available:[],candidateAssetIDs:selectedIDs};
  p.purpose=state.matchPurpose;p.intent=state.matchIntent;p.contentPolicy=state.matchContentPolicy;
  p.textPresentation='mixed';p.userText='';p.providedFacts='';p.styles=[...state.matchStyles];p.purposes=[...state.matchPurposes];
  p.requiredAssetIDs=[...scope.required];p.processing='自由拆解';p.creationMode=state.matchCreationMode||'edit';
  return p;
}

// Selection provenance determines the initial required/preferred priority.
// A manual star toggle still overrides the default after the asset is added.
export function addMatchingFromLibrary(state,ids=[]){
  const allowed=new Set(state.assets.filter(a=>a.supply?.quantity!==0).map(a=>a.id));
  const added=[...new Set(ids)].filter(id=>allowed.has(id));
  state.basket=[...new Set([...(state.basket||[]),...added])];
  state.coreIDs=[...new Set([...(state.coreIDs||[]),...added])];
  state.excludedAssetIDs=(state.excludedAssetIDs||[]).filter(id=>!added.includes(id));
  state.matchCore=state.coreIDs[0]||state.basket[0]||null;
  return added;
}
export function addMatchingFromRecommendation(state,id){
  if(!state.assets.some(asset=>asset.id===id&&asset.supply?.quantity!==0))return false;
  state.basket=[...new Set([...(state.basket||[]),id])];
  state.excludedAssetIDs=(state.excludedAssetIDs||[]).filter(value=>value!==id);
  // Never auto-star a recommendation. A previously starred item remains so.
  return true;
}

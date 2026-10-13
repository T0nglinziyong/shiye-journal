// Scoped Matching commands: business state is mutated here; visual updates
// are performed only by the mounted Matching controller.
export function registerMatchingActions(store,{addMatchingFromRecommendation}){
  const emit=(type,change,regions,syncDefaults=false)=>store.register(type,(payload,state)=>{
    const result=change(payload,state);
    return {scope:'matching',notify:true,keys:[],ids:payload.id?[payload.id]:[],
      result,payload:{...payload,regions,syncDefaults}};
  });
  emit('matching/filter',({value},state)=>{state.recommendFilter=value;},
    ['.match-chips','.match-rec-grid'],true);
  emit('matching/exclude',({id},state)=>{
    state.excludedAssetIDs=[...new Set([...state.excludedAssetIDs,id])];
  },['.match-rec-grid','.basket>.muted','.match-recommendations .match-panel-head small','.match-action']);
  emit('matching/include',({id},state)=>{
    state.excludedAssetIDs=state.excludedAssetIDs.filter(x=>x!==id);
  },['.match-rec-grid','.basket>.muted','.match-recommendations .match-panel-head small','.match-action']);
  emit('matching/priority',({id},state)=>{
    state.coreIDs=state.coreIDs.includes(id)
      ?state.coreIDs.filter(x=>x!==id):[...state.coreIDs,id];
    state.matchCore=state.coreIDs[0]||state.basket[0];
  },['.match-basket-scroll','.basket>.muted','.match-action']);
  emit('matching/basket',({id},state)=>{
    if(state.basket.includes(id)){
      state.basket=state.basket.filter(x=>x!==id);
      state.coreIDs=state.coreIDs.filter(x=>x!==id);
    }else addMatchingFromRecommendation(state,id);
  },['.match-basket-scroll','.basket>.muted','.match-rec-grid',
    '.match-recommendations .match-panel-head small','.match-action']);
}
export function createMatchingController({renderHTML,actions,updateMatchingRegions,queueDefaults}){
  return {
    render:renderHTML,
    mount(lifetime){
      lifetime.use(actions.subscribe(event=>{
        if(event.scope!=='matching')return;
        updateMatchingRegions(event.payload.regions);
        if(event.payload.syncDefaults)queueDefaults();
      },{scope:'matching'}));
    }
  };
}

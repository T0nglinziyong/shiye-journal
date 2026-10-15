export function createLibraryController({
  view,state,parity,onCatalogChanged,actions
}){
  return {
    patch(){
      if(view.dataset.renderedRoute!=='library'||
         view.dataset.renderedLibraryTab!==parity.libraryTab||
         view.dataset.renderedSeriesID!==(state.seriesID||'all')||
         parity.selectionMode||state.addingToSeries)return false;
      // React owns the cards and pager. An Action asks that component to
      // reconcile its current state; no HTML is inserted behind React's back.
      onCatalogChanged();return true;
    },
    mount(lifetime){
      // React owns the inputs and dispatches the same domain action.
      lifetime.use(actions.subscribe(event=>{
        if(event.scope==='library')onCatalogChanged();
      },{scope:'library'}));
      onCatalogChanged();
    }
  };
}

// Domain controller owns the state transition; subscribers own DOM updates.
export function registerLibraryActions(actions,{db,state,asset}){
  actions.register('library/filter',({key,value})=>{
    if(!['query','kind','status','seriesID','sort'].includes(key))
      throw Error('未知素材筛选条件');
    return {changes:{[key]:value},scope:'library'};
  });
  actions.register('library/favorite',async({id})=>{
    const entry=asset(id);
    if(!entry)throw Error('素材不存在');
    const next={...entry,isFavorite:!entry.isFavorite};
    await db.put('assets',next);
    Object.assign(entry,next);
    return {notify:true,scope:'library',ids:[id],result:next.isFavorite};
  });
}

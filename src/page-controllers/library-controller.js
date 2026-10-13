export function createLibraryController({
  renderHTML,patchCatalog,view,state,parity,render,binder,onCatalogChanged
}){
  return {
    render:renderHTML,
    patch(){
      if(view.dataset.renderedRoute!=='library'||
         view.dataset.renderedLibraryTab!==parity.libraryTab||
         parity.selectionMode||state.addingToSeries)return false;
      if(!patchCatalog(view,renderHTML()))return false;
      binder({partial:true});
      onCatalogChanged();return true;
    },
    mount(lifetime){
      // Filtering belongs to this page. Each event changes business state via
      // an Action; it never directly rebuilds the route or replaces inputs.
      const map=[['search','query'],['kind-filter','kind'],['status-filter','status'],
        ['series-filter','seriesID'],['sort-filter','sort']];
      for(const [id,key] of map){
        const el=view.querySelector('#'+id);if(!el)continue;
        lifetime.on(el,id==='search'?'input':'change',()=>{
          void onCatalogChanged({type:'filter',key,value:el.value});
        });
      }
      onCatalogChanged();
    }
  };
}

export function createWorksController({
  renderHTML,patchCatalog,view,state,parity,render,binder,bindCards,
  refreshPreviews,reusePreviews,coverBackfill,localCovers,catalogChanged
}){
  return {
    render:renderHTML,
    patch(){
      if(view.dataset.renderedRoute!=='works'||
         view.dataset.renderedWorkTab!==parity.workTab||parity.selectionMode||
         ['trash','templates'].includes(parity.workTab))return false;
      const result=patchCatalog(view,renderHTML());
      if(!result)return false;
      binder({partial:true});
      if(result.touched.length){
        bindCards(result.touched);
        reusePreviews();
        refreshPreviews();
        view.workCoverDispose?.();
        view.localWorkCoverDispose?.();
        view.workCoverDispose=coverBackfill.observe(view);
        view.localWorkCoverDispose=localCovers.observe(view);
      }
      catalogChanged();return true;
    }
  };
}

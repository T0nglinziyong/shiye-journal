export function createWorksController({
  renderHTML,patchCatalog,view,state,parity,render,binder,bindCards,
  refreshPreviews,reusePreviews,coverBackfill,localCovers,catalogChanged,actions
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
    },
    mount(lifetime){
      lifetime.use(actions.subscribe(event=>{
        if(event.scope==='works')render();
      },{scope:'works'}));
    }
  };
}
export function registerWorksActions(actions){
  actions.register('works/filter',({value})=>({
    changes:{worksFilter:value},scope:'works'
  }));
}

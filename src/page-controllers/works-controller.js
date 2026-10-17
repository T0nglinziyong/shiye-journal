export function createWorksController({view,parity,render,actions,onCatalogChanged}){
  return {
    patch(){
      if(view.dataset.renderedRoute!=='works'||
         view.dataset.renderedWorkTab!==parity.workTab||
         !view.querySelector('.works-page'))return false;
      // The mounted page reads the latest shared state. Preserve its cards,
      // scroll position and image observers while reconciling the list.
      onCatalogChanged();return true;
    },
    mount(lifetime){
      lifetime.use(()=>{
        view.workCoverDispose?.();view.workCoverDispose=null;
        view.localWorkCoverDispose?.();view.localWorkCoverDispose=null;
      });
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

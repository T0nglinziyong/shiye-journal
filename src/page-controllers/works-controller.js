export function createWorksController({view,render,actions}){
  return {
    patch(){
      // WorksPage owns its card list in React. Cover-only refresh cannot
      // reconcile a changed projects prop (for example moving a draft to
      // Recently Deleted), so let the route render update that list.
      return false;
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

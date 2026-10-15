export function createWorksController({
  view,state,parity,render,localCovers,catalogChanged,actions
}){
  return {
    patch(){
      if(view.dataset.renderedRoute!=='works'||
         view.dataset.renderedWorkTab!==parity.workTab||parity.selectionMode||
         ['trash','templates'].includes(parity.workTab))return false;
      catalogChanged();return true;
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

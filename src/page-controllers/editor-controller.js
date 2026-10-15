export function createEditorController({patchScene,createEditor,actions,render,view}){
  return {
    patch:patchScene,
    mount(lifetime){
      lifetime.use(actions.subscribe(event=>{
        if(event.scope==='editor')render();
      },{scope:'editor'}));
      // Existing Scene/Canvas pointer, undo and resize lifetimes stay owned by
      // the editor's established editorDispose hook; host calls it on teardown.
      createEditor();
      const dispose=view.editorDispose;
      lifetime.use(()=>{
        dispose?.();
        if(view.editorDispose===dispose)view.editorDispose=null;
      });
    }
  };
}
export function registerEditorActions(actions,{historyStep}){
  actions.register('editor/zoom',({delta},state)=>({
    changes:{zoom:Math.max(1,Math.min(4,Number(state.zoom||1)+Number(delta||0)))},
    scope:'editor'
  }));
  for(const type of ['undo','redo'])actions.register('editor/'+type,()=>{
    if(historyStep(type,type==='undo'?'redo':'undo'))
      return {notify:true,scope:'editor'};
    return {result:false};
  });
}

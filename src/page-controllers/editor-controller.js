export function createEditorController({renderHTML,patchScene,createEditor,actions,render,view}){
  return {
    render:renderHTML,
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
  for(const type of ['undo','redo'])actions.register('editor/'+type,()=>{
    if(historyStep(type,type==='undo'?'redo':'undo'))
      return {notify:true,scope:'editor'};
    return {result:false};
  });
}

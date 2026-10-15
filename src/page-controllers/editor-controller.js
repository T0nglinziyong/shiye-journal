export function createEditorController({createEditor,actions,render}){
  return {
    mount(lifetime){
      lifetime.use(actions.subscribe(event=>{
        if(event.scope==='editor')render();
      },{scope:'editor'}));
      // FabricSceneStage owns its pointer and canvas lifetime through React.
      createEditor();
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

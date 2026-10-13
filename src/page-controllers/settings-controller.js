export function createSettingsController({
  renderHTML,patchModel,view,state,binder
}){
  return {
    render:renderHTML,
    patch(){
      if(state.settingsSection!=='AI 与创作'||
         view.dataset.renderedRoute!=='settings'||
         view.dataset.renderedSettingsSection!==state.settingsSection||
         !patchModel(view,renderHTML()))return false;
      binder({partial:true});return true;
    }
  };
}

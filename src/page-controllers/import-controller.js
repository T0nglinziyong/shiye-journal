export function createImportController({
  renderHTML,patchInspector,view,state,binder,mountControls,
  disposePaper,disposeManual,mountPaper,mountManual,render
}){
  return {
    render:renderHTML,
    patch(){
      if(view.dataset.renderedRoute!=='import'||
         view.dataset.renderedImportStep!==state.importStep||
         view.dataset.renderedImportMode!==state.importMode)return false;
      const result=patchInspector(view,renderHTML());
      if(!result)return false;
      binder({partial:true});
      mountControls();
      if(result.photoReplaced){disposePaper();disposeManual();}
      if(state.showManualBox&&!view.querySelector('.manual-box-layer'))mountManual();
      else if(state.importFile&&!state.importProcessing&&!state.showManualBox&&
              !state.showCorrectionPreview&&!view.querySelector('.paper-corner-overlay'))
        mountPaper();
      return true;
    }
  };
}

export function createEditorController({renderHTML,patchScene,createEditor}){
  return {
    render:renderHTML,
    patch:patchScene,
    mount(){
      // Existing Scene/Canvas pointer, undo and resize lifetimes stay owned by
      // the editor's established editorDispose hook; host calls it on teardown.
      createEditor();
    }
  };
}

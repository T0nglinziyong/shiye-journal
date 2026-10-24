export function createImportController({
  view,state,render,actions,refreshReact
}){
  let mountedSource=null;
  let mountedIndex=-1;
  const photoSource=()=>state.showManualBox?state.correctedURL||state.importURL:
    state.showCorrectionPreview?state.paperPreviewURL||state.correctedURL:state.importURL;
  return {
    patch(){
      if(view.dataset.renderedRoute!=='import'||
         view.dataset.renderedImportStep!==state.importStep||
         view.dataset.renderedManualBox!==String(!!state.showManualBox)||
         view.dataset.renderedImportMode!==state.importMode||
         state.importStep!=='inspect'||mountedIndex!==state.importIndex||
         mountedSource!==photoSource())return false;
      refreshReact();
      return true;
    },
    mount(lifetime){
      mountedSource=photoSource();
      mountedIndex=state.importIndex;
      lifetime.use(actions.subscribe(event=>{
        if(event.scope!=='import')return;
        if(event.type==='import/candidate/toggle')refreshReact();
        else render();
      },{scope:'import'}));
    }
  };
}
export function registerImportActions(actions,{state,saveActiveImportRecord}){
  actions.register('import/candidate/toggle',({index})=>{
    const id=Number(index);
    if(!Number.isInteger(id)||id<0||id>=state.importCandidates.length)
      throw Error('候选素材序号无效');
    state.importCandidateSelection||=new Set();
    if(state.importCandidateSelection.has(id))state.importCandidateSelection.delete(id);
    else state.importCandidateSelection.add(id);
    if(state.importRecords[state.importIndex])
      state.importRecords[state.importIndex].confirmed=false;
    saveActiveImportRecord();
    return {notify:true,scope:'import',ids:[id],result:state.importCandidateSelection.has(id)};
  });
  actions.register('import/review/toggle',({record,index})=>{
    const candidate=state.importRecords[Number(record)]?.selectedCandidates?.[Number(index)];
    if(!candidate)throw Error('复核素材不存在');
    candidate.selected=!candidate.selected;
    return {notify:true,scope:'import',ids:[Number(index)],result:candidate.selected};
  });
}

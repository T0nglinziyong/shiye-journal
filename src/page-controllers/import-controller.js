import {syncBusyControls} from '../ui-disabled-state.js';

export function createImportController({
  renderHTML,patchInspector,view,state,binder,mountControls,
  disposePaper,disposeManual,mountPaper,mountManual,render,actions
}){
  return {
    patch(){
      if(view.dataset.renderedRoute!=='import'||
         view.dataset.renderedImportStep!==state.importStep||
         view.dataset.renderedManualBox!==String(!!state.showManualBox)||
         view.dataset.renderedImportMode!==state.importMode)return false;
      const result=patchInspector(view,renderHTML());
      if(!result)return false;
      binder({partial:true});
      syncBusyControls(view,'.inspect-columns button,.inspect-columns input,.inspect-columns select',
        !!state.importProcessing);
      mountControls();
      if(result.photoReplaced){disposePaper();disposeManual();}
      if(state.showManualBox&&!view.querySelector('.manual-box-layer'))mountManual();
      else if(state.importFile&&!state.importProcessing&&!state.showManualBox&&
              !state.showCorrectionPreview&&!view.querySelector('.paper-corner-overlay'))
        mountPaper();
      return true;
    },
    mount(lifetime){
      lifetime.use(()=>{disposePaper();disposeManual();});
      lifetime.use(actions.subscribe(event=>{
        if(event.scope!=='import')return;
        if(event.type==='import/candidate/toggle'){
          const id=String(event.payload.index);
          const selected=state.importCandidateSelection?.has(Number(id));
          const tile=view.querySelector('[data-act="import-toggle-candidate"][data-id="'+id+'"]');
          tile?.classList.toggle('selected',!!selected);
          tile?.setAttribute('aria-pressed',String(!!selected));
          const label=tile?.querySelectorAll('span')[1];
          if(label)label.textContent='素材 '+(Number(id)+1)+' '+(selected?'✓':'○');
        }else render();
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

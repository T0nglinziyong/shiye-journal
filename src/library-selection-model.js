// Selection is transient UI state. A mode is the only source of truth; there
// is deliberately no second `selection` flag to drift out of sync with it.
const scopes={asset:new Set(['series','library','assetDetail']),series:new Set(['series']),work:new Set(['works'])};
export const selectionActive=(state,mode)=>state.selectionMode===mode;
export function finishSelection(state){
  state.selectionMode=null;
  state.selected.clear();
  state.showOnlySelected=false;
}
export function beginSelection(state,mode){
  if(!scopes[mode])throw Error('未知的选择模式：'+mode);
  finishSelection(state);
  state.selectionMode=mode;
}
export function toggleSelection(state,mode){
  if(state.selectionMode){finishSelection(state);return false;}
  beginSelection(state,mode);
  return true;
}
export function syncSelectionScope(state,route){
  // Settings is a temporary overlay, not navigation away from the collection.
  if(route==='settings')return;
  if(state.selectionMode&&!scopes[state.selectionMode]?.has(route))finishSelection(state);
  state.route=route;
}
export function toggleSelected(state,id){
  if(!state.selectionMode)return false;
  if(state.selected.has(id))state.selected.delete(id);else state.selected.add(id);
  return state.selected.has(id);
}
export function reconcileSelectedRecords(state,{assets=[],series=[],projects=[]}){
  const records=state.selectionMode==='asset'?assets:state.selectionMode==='series'?series:state.selectionMode==='work'?projects:[];
  const available=new Set(records.map(record=>record.id));let changed=false;
  for(const id of state.selected)if(!available.has(id)){state.selected.delete(id);changed=true;}
  return changed;
}

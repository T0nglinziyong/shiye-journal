export function finishSelection(p){p.selection=false;p.selectionMode=null;p.selected.clear();p.showOnlySelected=false;}
export function beginSelection(p,mode){finishSelection(p);p.selection=true;p.selectionMode=mode;}
export function syncSelectionScope(p,route){
  // Settings is an overlay destination, not leaving the underlying library.
  if(route==='settings')return;
  const stays=p.selectionMode==='asset'?['series','library','assetDetail'].includes(route):p.selectionMode==='series'?route==='series':p.selectionMode==='work'?route==='works':false;
  if(p.selection&&!stays)finishSelection(p);p.route=route;
}

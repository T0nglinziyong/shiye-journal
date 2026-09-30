// A route can host more than one selection surface (the series list can also
// carry an asset selection). Every surface receives the same state change.
export function resetSelectionPresenters(view){
  view.selectionPresenters=[];
  view.selectionRefresh=null;
}
export function registerSelectionPresenter(view,update){
  view.selectionPresenters.push(update);
  view.selectionRefresh=()=>{for(const presenter of view.selectionPresenters)presenter();return true;};
  update();
}

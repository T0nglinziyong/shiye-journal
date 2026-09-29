// Object geometry is authoritative. Never mirror overlay mutations back into
// the artwork: an old overlay must not move an object to a stale position.
export function syncSelectionGeometry(page,id){
  const object=[...page.querySelectorAll('[data-object]')].find(n=>n.dataset.object===id);
  const overlay=[...page.querySelectorAll('[data-selection-for]')].find(n=>n.dataset.selectionFor===id);
  if(!object||!overlay)return;
  for(const key of ['left','top','width','height','transform'])overlay.style[key]=object.style[key];
}

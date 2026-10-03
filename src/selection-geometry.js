// Object geometry is authoritative. Never mirror overlay mutations back into
// artwork. A woven material has several render projections but one transform;
// keep every projection together during pointer movement, not only on release.
export function syncSelectionGeometry(page,id){
  const projections=[...page.querySelectorAll('[data-object]')].filter(n=>n.dataset.object===id);
  const object=projections[0];if(!object)return;
  const overlay=[...page.querySelectorAll('[data-selection-for]')].find(n=>n.dataset.selectionFor===id);
  for(const node of [...projections.slice(1),...(overlay?[overlay]:[])]){
    for(const key of ['left','top','width','height','transform']){
      if(node.style[key]!==object.style[key])node.style[key]=object.style[key];
    }
  }
  // clip/mask, render keys and z-index belong to individual projections. They
  // must not be copied from the first fragment or overwrite physical layers.
}

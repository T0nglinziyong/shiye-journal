// Material-library list adapter: stable card keys, no full #view teardown.
// The same DOM reconciliation primitive can be replaced with React/Vue later.
import {reconcileKeyedChildren} from './ui-keyed-dom.js';
const key=card=>card.matches('.action-card')?'__import__':card.dataset.id||null;
export function patchMaterialCatalog(view,html){
  if(view.querySelector('.series-contents,.recently-deleted-grid,.selection-results'))return null;
  const live=view.querySelector('.asset-grid');
  if(!live||!live.classList.contains('asset-grid'))return null;
  const template=document.createElement('template');template.innerHTML=html;
  const fresh=template.content.querySelector('.asset-grid');
  if(!fresh||!template.content.querySelector('.filters'))return null;
  // A grid/list display mode change requires full mounting of its layout.
  if(live.classList.contains('list-grid')!==fresh.classList.contains('list-grid'))return null;
  return reconcileKeyedChildren(live,fresh,key,{
    update(current,next,id){
      if(id==='__import__')return current.outerHTML===next.outerHTML;
      if(current.dataset.cardRevision!==next.dataset.cardRevision)return false;
      // Preserve its decoded <img>, click listeners and IntersectionObserver.
      return true;
    }
  });
}

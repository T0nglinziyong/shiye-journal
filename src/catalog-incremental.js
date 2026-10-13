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

// Works catalog has additional action tiles mounted by parity-ui; include
// them as stable pseudo-keys so a data refresh never deletes their listeners.
export function patchWorksCatalog(view,html){
  if(view.querySelector('.recently-deleted-grid,.journal-template-grid,.selection-results'))return null;
  const live=view.querySelector('.works-page .works-grid');
  if(!live)return null;
  const template=document.createElement('template');template.innerHTML=html;
  const fresh=template.content.querySelector('.works-page .works-grid');
  if(!fresh)return null;
  const originals=new Map([...live.querySelectorAll(':scope > .card[data-act="open-project"]')]
    .map(card=>[card.dataset.id,card]));
  const desired=document.createElement('div');
  for(const tile of live.querySelectorAll(':scope > .work-entry'))desired.append(tile.cloneNode(true));
  desired.append(...[...fresh.children]);
  const key=card=>card.dataset.id?'project:'+card.dataset.id:
    card.classList.contains('work-entry')?'utility:'+card.textContent:null;
  const stats=reconcileKeyedChildren(live,desired,key,{
    update(current,next,id){
      if(id?.startsWith('utility:'))return true;
      return current.dataset.workRevision===next.dataset.workRevision;
    }
  });
  return {...stats,touched:[...live.querySelectorAll(':scope > .card[data-act="open-project"]')]
    .filter(card=>originals.get(card.dataset.id)!==card)};
}

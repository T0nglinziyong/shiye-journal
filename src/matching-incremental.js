// Incremental Matching UI updates: no #view teardown, no re-binding all
// page controls, and no replacing an unchanged image/card or text editor.
// The full markup is created OFF-DOM only to compute the few changed regions.
import {captureMatchingScroll,restoreMatchingScroll} from './matching-scroll.js';

const keyed=child=>child?.dataset?.matchAsset||null;

function syncAttributes(current,next){
  for(const attr of [...current.attributes]){
    if(!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
  }
  for(const attr of [...next.attributes]){
    if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
  }
  if('disabled' in current&&'disabled' in next)current.disabled=next.disabled;
}
function updateCard(current,next,bind){
  // Keep the outer card and its decoded image. Only rewrite the text/actions
  // subview if a favorite/role/exclusion actually changed. Other items do
  // not even lose their existing button nodes or event handlers.
  syncAttributes(current,next);
  const body=current.lastElementChild,fresh=next.lastElementChild;
  if(!body||!fresh)return false;
  if(body.outerHTML!==fresh.outerHTML){
    bind(fresh);
    body.replaceWith(fresh);
  }
  return true;
}
function reconcileCards(current,next,bind){
  const previous=new Map([...current.children].filter(keyed).map(child=>[keyed(child),child]));
  const updates=[];
  for(const candidate of [...next.children]){
    const key=keyed(candidate),existing=key&&previous.get(key);
    if(existing&&updateCard(existing,candidate,bind)){
      updates.push(existing);previous.delete(key);
    }else{
      bind(candidate);
      updates.push(candidate);
    }
  }
  // Never call replaceChildren() on every star click: even re-inserting the
  // same nodes briefly detaches decoded images and can trigger needless
  // mutation-observer work, image loads and scroll anchoring shifts.
  for(let index=0;index<updates.length;index++){
    const item=updates[index],before=current.children[index]||null;
    if(before!==item)current.insertBefore(item,before);
  }
  const retained=new Set(updates);
  for(const child of [...current.children])if(!retained.has(child))child.remove();
}
function syncFilters(current,next){
  for(const button of current.querySelectorAll('[data-act="match-filter"]')){
    const other=[...next.querySelectorAll('[data-act="match-filter"]')]
      .find(item=>item.dataset.val===button.dataset.val);
    if(other)syncAttributes(button,other);
  }
}
export function patchMatchingView({
  view,renderHTML,regions=[],onAction,mountIcons=()=>{}
}){
  if(!view?.querySelector('.matching-page'))return false;
  const snapshot=captureMatchingScroll(view,globalThis.window);
  const template=document.createElement('template');
  template.innerHTML=renderHTML();
  const draft=template.content;
  const bind=node=>{
    for(const button of [node,...node.querySelectorAll('[data-act]')].filter(el=>el.matches?.('[data-act]'))){
      button.addEventListener('click',()=>onAction(button.dataset.act,button.dataset.id,button.dataset.val));
    }
    mountIcons(node);
  };
  for(const selector of [...new Set(regions)]){
    const existing=view.querySelector(selector),next=draft.querySelector(selector);
    if(!existing||!next)continue;
    if(selector==='.match-basket-scroll'||selector==='.match-rec-grid'){
      reconcileCards(existing,next,bind);
    }else if(selector==='.match-chips'){
      syncFilters(existing,next);
    }else if(selector==='.match-action'){
      const oldText=existing.querySelector('p'),newText=next.querySelector('p');
      if(oldText&&newText)oldText.textContent=newText.textContent;
      for(const button of existing.querySelectorAll('button[data-act]')){
        const other=next.querySelector('[data-act="'+button.dataset.act+'"]');
        if(other)button.disabled=other.disabled;
      }
    }else if(selector==='.basket>.muted'||selector==='.match-recommendations .match-panel-head small'){
      existing.textContent=next.textContent;
    }else{
      // Proposals change only on explicit generation/history actions, so
      // replace that independent pane rather than the full Matching page.
      existing.replaceWith(next);
      bind(next);
    }
  }
  if(snapshot)restoreMatchingScroll(view,snapshot,globalThis.window,{restoreViewport:false});
  return true;
}

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
function updateCard(current,next){
  // Images belong to the hydrated image-resource cache. Keep those decoded
  // nodes and their URLs unchanged when only a star or label has changed.
  syncAttributes(current,next);
  for(const selector of ['strong','.match-priority','.match-type','.material-use-summary']){
    const before=current.querySelector(selector),after=next.querySelector(selector);
    if(before&&after){syncAttributes(before,after);if(before.textContent!==after.textContent)before.textContent=after.textContent;}
    else if(before&&!after)before.remove();
    else if(!before&&after){
      const target=current.querySelector('strong')?.parentElement||current.lastElementChild;
      target?.append(after.cloneNode(true));
    }
  }
  const oldButtons=[...current.querySelectorAll('button[data-act]')];
  const newButtons=[...next.querySelectorAll('button[data-act]')];
  // Both matching card forms have a fixed button structure per material.
  if(oldButtons.length!==newButtons.length)return false;
  for(let i=0;i<oldButtons.length;i++){
    const button=oldButtons[i],replacement=newButtons[i];
    syncAttributes(button,replacement);
    if(button.textContent!==replacement.textContent)button.textContent=replacement.textContent;
  }
  const oldSmalls=[...current.querySelectorAll('small')];
  const newSmalls=[...next.querySelectorAll('small')];
  if(oldSmalls.length===newSmalls.length){
    for(let i=0;i<oldSmalls.length;i++){
      syncAttributes(oldSmalls[i],newSmalls[i]);
      if(oldSmalls[i].textContent!==newSmalls[i].textContent)oldSmalls[i].textContent=newSmalls[i].textContent;
    }
  }
  return true;
}
function reconcileCards(current,next,bind){
  const previous=new Map([...current.children].filter(keyed).map(child=>[keyed(child),child]));
  const updates=[];
  for(const candidate of [...next.children]){
    const key=keyed(candidate),existing=key&&previous.get(key);
    if(existing&&updateCard(existing,candidate)){
      updates.push(existing);previous.delete(key);
    }else{
      bind(candidate);
      updates.push(candidate);
    }
  }
  current.replaceChildren(...updates); // moves existing nodes, never clones them
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

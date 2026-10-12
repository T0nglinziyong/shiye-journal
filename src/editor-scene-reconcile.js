// Reconcile only editable Scene nodes, never the canvas page, pointer capture,
// text input, image decoders, toolbar or open layer popover. The same recursive
// hierarchy is used by the DOM, layer inspector, PNG and SVG renderers.
const sceneElement=node=>node?.nodeType===1&&(
  node.matches('.scene-v2-group[data-scene-group]')||
  node.matches('.canvas-object[data-render-key]'));
const sceneKey=node=>node.dataset.sceneGroup?'group:'+node.dataset.sceneGroup:
  node.dataset.renderKey?'leaf:'+node.dataset.renderKey:null;

export function reconcileEditorScene(container,markup,{onText=()=>{},onImage=()=>{}}={}){
  const template=container.ownerDocument.createElement('template');
  template.innerHTML=markup;
  let preserved=0,created=0,removed=0;
  const reconcile=(parent,fresh,anchor=null)=>{
    const previous=[...parent.children].filter(sceneElement),before=new Map(previous.map(node=>[sceneKey(node),node]));
    let next=anchor;
    for(const desired of [...fresh.children].filter(sceneElement).reverse()){
      const key=sceneKey(desired);let live=before.get(key);
      if(live&&live.tagName!==desired.tagName){live.remove();live=null;}
      if(!live){live=desired;created++;}
      else{
        preserved++;
        const typing=live.classList.contains('typing')||!!live.querySelector('.canvas-inline-text');
        if(live.style.cssText!==desired.style.cssText)live.style.cssText=desired.style.cssText;
        const className=(desired.getAttribute('class')||'')+(typing?' typing':'');
        if(live.getAttribute('class')!==className)live.setAttribute('class',className);
        for(const attr of ['data-object','data-kind','data-render-key','aria-hidden']){
          const value=desired.getAttribute(attr);
          if(value===null){if(live.hasAttribute(attr))live.removeAttribute(attr);}
          else if(live.getAttribute(attr)!==value)live.setAttribute(attr,value);
        }
        if(live.dataset.sceneGroup)reconcile(live,desired);
        else if(live.dataset.kind==='text'){
          if(!typing)onText(live,desired);
        }else if(live.dataset.kind==='material')onImage(live,desired);
        else if(live.dataset.kind==='ink'){
          // Rebuild the short SVG path only if its actual content changed.
          if(live.innerHTML!==desired.innerHTML)live.innerHTML=desired.innerHTML;
        }else if(live.innerHTML!==desired.innerHTML)live.replaceChildren(...desired.childNodes);
      }
      if(live.parentNode!==parent||live.nextElementSibling!==next)parent.insertBefore(live,next);
      next=live;
      before.delete(key);
    }
    for(const node of before.values()){node.remove();removed++;}
  };
  // Keep paper and ink canvases (and editing/selection overlays) in place.
  reconcile(container,template.content,container.querySelector('.paper-layer'));
  return {preserved,created,removed};
}

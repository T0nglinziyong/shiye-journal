// Only this node owns rendered copy. Selection handles and the live IME input
// are siblings, so a canvas refresh cannot accidentally prepend the source a
// second time or replace an in-progress composition.
export function reconcileCanvasText(node, next){
  if(node.querySelector('.canvas-inline-text') || node.classList.contains('typing'))return false;
  const fresh=next.querySelector('[data-text-content]');
  if(!fresh)return false;
  const current=node.querySelector('[data-text-content]');
  if(current?.innerHTML===fresh.innerHTML)return false;
  if(current)current.replaceWith(fresh);
  else{
    for(const child of [...node.childNodes]){
      if(child.nodeType===3 || child.nodeType===1 && child.matches?.('span:not([class])'))child.remove();
    }
    node.prepend(fresh);
  }
  return true;
}

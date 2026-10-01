// Only this node owns rendered copy. Selection handles and the live IME input
// are siblings, so a canvas refresh cannot accidentally prepend the source a
// second time or replace an in-progress composition.
const escapeText=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export function textParagraphMarkup(item,spacing){
  if(!item.paragraphSpacing)return escapeText(item.content);
  return String(item.content??'').split('\n').map((part,index)=>`<span style="display:block;${index?`margin-top:${spacing};`:''}">${escapeText(part)||'&#8203;'}</span>`).join('');
}
export function reconcileCanvasText(node, next){
  if(node.querySelector('.canvas-inline-text') || node.classList.contains('typing'))return false;
  const fresh=next.querySelector('[data-text-content]');
  if(!fresh)return false;
  const current=node.querySelector('[data-text-content]');
  if(current?.innerHTML===fresh.innerHTML)return false;
  const selection=node.ownerDocument.defaultView?.getSelection?.();
  const range=selection?.rangeCount?selection.getRangeAt(0):null;
  let selectionOffsets;
  if(current&&range&&current.contains(range.startContainer)&&current.contains(range.endContainer)){
    const before=point=>{const prefix=node.ownerDocument.createRange();prefix.selectNodeContents(current);prefix.setEnd(point.container,point.offset);return prefix.toString().length;};
    selectionOffsets=[before({container:range.startContainer,offset:range.startOffset}),before({container:range.endContainer,offset:range.endOffset})];
  }
  if(current)current.replaceWith(fresh);
  else{
    for(const child of [...node.childNodes]){
      if(child.nodeType===3 || child.nodeType===1 && child.matches?.('span:not([class])'))child.remove();
    }
    node.prepend(fresh);
  }
  if(selectionOffsets){
    const point=offset=>{const walker=node.ownerDocument.createTreeWalker(fresh,4);let leaf=walker.nextNode(),last=null;while(leaf){last=leaf;if(offset<=leaf.textContent.length)return [leaf,offset];offset-=leaf.textContent.length;leaf=walker.nextNode();}return last?[last,last.textContent.length]:[fresh,0];};
    const start=point(selectionOffsets[0]),end=point(selectionOffsets[1]),restored=node.ownerDocument.createRange();
    restored.setStart(...start);restored.setEnd(...end);selection.removeAllRanges();selection.addRange(restored);
  }
  return true;
}

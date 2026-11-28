// Scroll-state snapshot for the matching workspace. Every click can cause a
// complete #view rerender, so window.scrollY alone is insufficient: the
// material basket, recommendations, horizontal chips, proposal history,
// result list and editable multi-line fields all have their own scroll state.
//
// Stable data-match-scroll IDs cover core panes. Future scrollable panels
// can reuse these slots or fall back to their stable structural paths.
const valid=value=>Number.isFinite(value)&&value>=0?value:0;
function childPath(node,root){
  const segments=[];
  while(node&&node!==root){
    const parent=node.parentElement;
    if(!parent)return null;
    segments.push(Array.prototype.indexOf.call(parent.children,node));
    node=parent;
  }
  return node===root?'tree:'+segments.reverse().join('.') :null;
}
function nodeKey(node,root){
  return node.dataset?.matchScroll?'slot:'+node.dataset.matchScroll:childPath(node,root);
}
function readScroll(node){return {top:valid(node.scrollTop),left:valid(node.scrollLeft)};}
function paneElements(root){
  const page=root?.querySelector?.('.matching-page');
  if(!page)return null;
  // Avoid forcing hundreds of image/card layout reads on every click.
  // Every real independent scroller is assigned an explicit stable slot.
  // Keep panels too, since a future breakpoint may make any panel scrollable.
  const panes=[page,...page.querySelectorAll(
    '[data-match-scroll],.match-direction,.match-recommendations,'+
    '.match-proposals,.match-action,.matching-layout > .basket,'+
    '.matching-layout > .panel'
  )];
  return {page,panes};
}
export function captureMatchingScroll(root,viewport=globalThis.window){
  const containers=paneElements(root);
  if(!containers)return null;
  const {page,panes}=containers;
  const entries=new Map();
  for(const node of panes){
    const key=nodeKey(node,page)||'page';
    entries.set(key,readScroll(node));
  }
  const expanded=[...page.querySelectorAll('details')].map((node,i)=>({
    key:node.dataset?.matchExpand||String(i),open:node.open
  }));
  const x=valid(viewport?.scrollX??viewport?.pageXOffset),
    y=valid(viewport?.scrollY??viewport?.pageYOffset);
  return {viewport:{left:x,top:y},entries:[...entries],expanded};
}
export function restoreMatchingScroll(root,snapshot,viewport=globalThis.window,{
  restoreViewport=true
}={}){
  if(!snapshot)return false;
  const containers=paneElements(root);
  if(!containers)return false;
  const {page,panes}=containers;
  // Details and panels must expand before restoring their inner scroll
  // positions; changing their height afterwards would cause an apparent jump.
  const states=new Map((snapshot.entries||[]).filter(row=>Array.isArray(row)&&row.length===2));
  const details=new Map((snapshot.expanded||[]).map(row=>[row.key,row.open]));
  [...page.querySelectorAll('details')].forEach((node,i)=>{
    const key=node.dataset?.matchExpand||String(i);
    if(details.has(key))node.open=!!details.get(key);
  });
  for(const node of panes){
    const position=states.get(nodeKey(node,page)||'page');
    if(!position)continue;
    node.scrollTop=valid(position.top);
    node.scrollLeft=valid(position.left);
  }
  if(restoreViewport&&snapshot.viewport&&typeof viewport?.scrollTo==='function'){
    const x=valid(snapshot.viewport.left),y=valid(snapshot.viewport.top);
    if(Math.abs((viewport.scrollX||0)-x)>.5||
       Math.abs((viewport.scrollY||0)-y)>.5)viewport.scrollTo(x,y);
  }
  return true;
}

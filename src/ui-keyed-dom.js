// Framework-agnostic DOM reconciliation. Components retain their actual nodes
// (and decoded images/listeners) when stable keys and rendered content match.
// No dependency on React, Vue or the global app state.
export function reconcileKeyedChildren(parent, desired, keyOf, {update,onInsert,onRemove}={}) {
  if(!parent||!desired)throw Error('缺少列表容器');
  const old=new Map();
  for(const child of [...parent.children]){
    const key=keyOf(child);
    if(key!=null&&!old.has(key))old.set(key,child);
  }
  let reused=0,inserted=0,removed=0,changed=0,cursor=parent.firstElementChild;
  for(const candidate of [...desired.children]){
    const key=keyOf(candidate),existing=key==null?null:old.get(key);
    if(existing)old.delete(key);
    let node=candidate;
    if(existing&&(!update||update(existing,candidate,key)!==false)){
      node=existing;reused++;
      if(node!==candidate)changed+=node.outerHTML===candidate.outerHTML?0:1;
    }else{
      inserted++;onInsert?.(candidate,key);
      if(existing){existing.remove();removed++;onRemove?.(existing,key);}
    }
    if(node!==cursor)parent.insertBefore(node,cursor);
    cursor=node.nextElementSibling;
  }
  for(const [key,node] of old){node.remove();removed++;onRemove?.(node,key);}
  return {reused,inserted,removed,changed};
}

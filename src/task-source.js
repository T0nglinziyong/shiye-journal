// Object member order is not part of the task contract. Preserve array order
// (materials and priority lists are meaningful), but compare objects stably.
export function canonicalTaskSource(value){
  return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
    ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0))
    :item);
}

export const TRASH_RETENTION_MS=7*24*60*60*1000;

export function expiredTrash(entries,now=Date.now()){
  return entries.filter(entry=>Number.isFinite(Date.parse(entry.date))&&now-Date.parse(entry.date)>=TRASH_RETENTION_MS);
}

// A single storage transaction is used for one or many entries. Blobs are not
// removed here: live works, history and other materials may still reference them.
export async function changeTrash({db,state,ids,recover=false}){
  const chosen=state.trash.filter(entry=>ids.includes(entry.id));
  if(!chosen.length)return 0;
  const names=recover?['assets','projects','trash']:['trash'];
  await db.transaction(names,tx=>{
    for(const entry of chosen){
      if(recover)tx.objectStore(entry.kind==='asset'?'assets':'projects').put(entry.item);
      tx.objectStore('trash').delete(entry.id);
    }
  });
  const selected=new Set(chosen.map(entry=>entry.id));
  state.trash=state.trash.filter(entry=>!selected.has(entry.id));
  if(recover)for(const entry of chosen){
    const store=entry.kind==='asset'?'assets':'projects';
    const records=state[store],index=records.findIndex(record=>record.id===entry.item.id);
    if(index<0)records.push(entry.item);else records[index]=entry.item;
  }
  return chosen.length;
}

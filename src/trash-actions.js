export const TRASH_RETENTION_MS=30*24*60*60*1000;

export function expiredTrash(entries,now=Date.now()){
  return entries.filter(entry=>Number.isFinite(Date.parse(entry.date))&&now-Date.parse(entry.date)>=TRASH_RETENTION_MS);
}

// A material removed from the library stays in assets after its trash card
// expires. Works, drafts and history may still resolve it by ID. The trash
// record controls only whether the user can restore the library card.
export async function changeTrash({db,state,ids,recover=false,awaitStage=async()=>{}}){
  const requested=state.trash.filter(entry=>ids.includes(entry.id));
  if(!requested.length)return 0;
  await awaitStage(requested.map(entry=>entry.id));
  const names=recover?['assets','projects','trash','meta']:['trash'];
  await db.transaction(names,tx=>{
    for(const entry of requested){
      if(recover){
        const store=entry.kind==='asset'?'assets':'projects';
        tx.objectStore('meta').delete('tombstone:'+store+':'+entry.item.id);
        tx.objectStore(store).put(entry.item);
      }
      tx.objectStore('trash').delete(entry.id);
    }
  });
  const selected=new Set(requested.map(entry=>entry.id));
  state.trash=state.trash.filter(entry=>!selected.has(entry.id));
  if(recover)for(const entry of requested){
    const store=entry.kind==='asset'?'assets':'projects';
    const records=state[store],index=records.findIndex(record=>record.id===entry.item.id);
    if(index<0)records.push(entry.item);else records[index]=entry.item;
  }
  return requested.length;
}

import {hiddenAssetCopy,referencedHiddenAssetIDs} from './asset-retention.js';
export const TRASH_RETENTION_MS=7*24*60*60*1000;

export function expiredTrash(entries,now=Date.now()){
  return entries.filter(entry=>Number.isFinite(Date.parse(entry.date))&&now-Date.parse(entry.date)>=TRASH_RETENTION_MS);
}

// The trash card may disappear, but a hidden asset is kept when any work,
// history, archive or pending edit still references it. Blob bytes are swept
// separately, after all asset and scene references have been verified.
export async function changeTrash({db,state,ids,recover=false}){
  const chosen=state.trash.filter(entry=>ids.includes(entry.id));
  if(!chosen.length)return 0;
  const assetEntries=chosen.filter(entry=>entry.kind==='asset');
  const hidden=assetEntries.filter(entry=>state.assets.some(asset=>asset.id===entry.item.id&&asset.hiddenFromLibraryAt));
  const legacy=assetEntries.filter(entry=>!state.assets.some(asset=>asset.id===entry.item.id));
  let removeHidden=[],retainLegacy=[];
  if(!recover&&assetEntries.length){
    let used;
    try{used=await referencedHiddenAssetIDs({db,assets:state.assets,
      trash:state.trash.filter(entry=>!ids.includes(entry.id)),candidateIDs:new Set(assetEntries.map(entry=>entry.item.id))});}
    catch{used=new Set(assetEntries.map(entry=>entry.item.id));}
    removeHidden=hidden.filter(entry=>!used.has(entry.item.id)).map(entry=>entry.item.id);
    retainLegacy=legacy.filter(entry=>used.has(entry.item.id)).map(entry=>hiddenAssetCopy(entry.item,entry.date));
  }
  const names=recover?['assets','projects','trash','meta']:removeHidden.length||retainLegacy.length?['assets','trash']:['trash'];
  await db.transaction(names,tx=>{
    for(const entry of chosen){
      if(recover){const store=entry.kind==='asset'?'assets':'projects';tx.objectStore('meta').delete('tombstone:'+store+':'+entry.item.id);tx.objectStore(store).put(entry.item);}
      tx.objectStore('trash').delete(entry.id);
    }
    for(const id of removeHidden)tx.objectStore('assets').delete(id);
    for(const asset of retainLegacy)tx.objectStore('assets').put(asset);
  });
  const selected=new Set(chosen.map(entry=>entry.id));
  state.trash=state.trash.filter(entry=>!selected.has(entry.id));
  if(removeHidden.length){const removed=new Set(removeHidden);state.assets=state.assets.filter(asset=>!removed.has(asset.id));}
  state.assets.push(...retainLegacy);
  if(recover)for(const entry of chosen){
    const store=entry.kind==='asset'?'assets':'projects';
    const records=state[store],index=records.findIndex(record=>record.id===entry.item.id);
    if(index<0)records.push(entry.item);else records[index]=entry.item;
  }
  return chosen.length;
}

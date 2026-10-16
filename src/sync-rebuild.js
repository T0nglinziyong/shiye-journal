// Recreate pending operations from today's local records. The original queued
// image bytes and delete/clear intentions remain part of the new outbox.
import {usableProjectSnapshot} from './project-outbox-recovery.js';
export function rebuildSyncRecords(rows,local={}){
  const byStore=new Map(['assets','series','projects','trash','meta'].map(store=>
    [store,new Map((local[store]||[]).filter(item=>item?.id).map(item=>[item.id,item]))]));
  const refresh=(store,item)=>{
    const current=byStore.get(store)?.get(item?.id);
    // The Works list can hold a thin cloud summary with an empty layer array.
    // It must never replace the full Scene already protected in the outbox.
    if(store==='projects'&&current&&(current.projectDocumentPath||
      !current.isSnapshot&&!usableProjectSnapshot(current)))
      return structuredClone(item);
    return current?structuredClone(current):store==='blobs'?item:structuredClone(item);
  };
  const records=[];
  const expanded=rows.flatMap(row=>row.record?.kind==='batch'&&
    Array.isArray(row.record.payload?.coalescedRows)
    ?row.record.payload.coalescedRows:[row]);
  for(const row of expanded){
    const envelope=row.record;
    if(envelope?.kind==='project'){
      records.push({...envelope,payload:refresh('projects',envelope.payload)});
      continue;
    }
    if(envelope?.kind!=='batch')throw Error('待同步队列包含未知数据；原队列未修改');
    const batch=envelope.payload;
    if(!batch||typeof batch.id!=='string')throw Error('待同步批次无效；原队列未修改');
    if(Array.isArray(batch.operations)){
      const operations=batch.operations.map(op=>op.action==='put'
        ?{...op,item:refresh(op.store,op.item)}:structuredClone(op));
      const {coalescedRows,...original}=batch;
      records.push({...envelope,payload:{...original,operations,
        names:[...new Set(operations.map(op=>op.store))]}});
      continue;
    }
    // An older import still contains its original image bytes. Metadata is
    // refreshed only where the current local library has the same ID.
    records.push({...envelope,payload:{...batch,
      assets:(batch.assets||[]).map(item=>refresh('assets',item)),
      projects:(batch.projects||[]).map(item=>refresh('projects',item)),
      blobs:[...(batch.blobs||[])]}});
  }
  return records;
}

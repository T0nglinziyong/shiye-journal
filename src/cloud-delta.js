// A missing/trimmed change log is a cache miss, never a partial library.
export async function readCloudDelta({client,owner,before,after,snapshots}){
  if(!Number.isSafeInteger(before)||after<=before||after-before>32)return null;
  const stores=['assets','series','projects','trash'];
  if(stores.some(store=>snapshots.get(store)?.revision!==before))return null;
  const result=await client.from('shiye_changes').select('revision,keys').eq('user_id',owner).gt('revision',before).lte('revision',after).order('revision').range(0,31);
  if(result.error)return null;
  const batches=result.data;
  if(!Array.isArray(batches)||batches.length!==after-before||batches.some((row,i)=>Number(row.revision)!==before+i+1||!Array.isArray(row.keys)))return null;
  const edits=new Map(),cleared=new Set();
  for(const batch of batches)for(const key of batch.keys){
    if(!['assets','series','projects','trash','blobs','meta'].includes(key.store)||!['put','delete','clear'].includes(key.action))return null;
    if(key.action==='clear'){cleared.add(key.store);for(const [id,value] of edits)if(value.store===key.store)edits.delete(id);}
    else{if(typeof key.id!=='string')return null;edits.set(JSON.stringify([key.store,key.id]),key);}
  }
  const patched=new Map(),blobIDs=[];
  for(const store of ['assets','series','projects','trash','blobs','meta']){
    const saved=snapshots.get(store);
    if(store==='blobs')blobIDs.push(...[...edits.values()].filter(k=>k.store===store).map(k=>k.id));
    if(saved?.revision!==before)continue;
    const records=new Map((cleared.has(store)?[]:saved.records).map(r=>[r.id,r])),puts=[];
    for(const key of edits.values())if(key.store===store){if(key.action==='delete')records.delete(key.id);else puts.push(key.id);}
    for(let offset=0;offset<puts.length;offset+=50){
      const ids=puts.slice(offset,offset+50),rows=await client.from('shiye_records').select('record').eq('user_id',owner).eq('store',store).in('id',ids).order('id').range(0,49);
      if(rows.error||rows.data.length!==ids.length)return null;
      for(const row of rows.data){if(!ids.includes(row.record?.id))return null;records.set(row.record.id,row.record);}
    }
    patched.set(store,{revision:after,records:[...records.values()]});
  }
  // Reads of changes and changed records must belong to one revision.
  const check=await client.from('shiye_revisions').select('revision').eq('user_id',owner).single();
  if(check.error||Number(check.data?.revision)!==after)return null;
  return {snapshots:patched,blobIDs,allBlobs:cleared.has('blobs')};
}

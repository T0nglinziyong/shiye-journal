// A missing/trimmed change log is a cache miss, never a partial library.
export async function readCloudDelta({client,owner,before,after,snapshots}){
  if(!Number.isSafeInteger(before)||after<=before||after-before>32)return null;
  const stores=['assets','series','projects','trash'];
  if(stores.some(store=>snapshots.get(store)?.revision!==before))return null;
  const result=await client.from('shiye_changes').select('revision,keys').eq('user_id',owner).gt('revision',before).lte('revision',after).order('revision').range(0,31);
  if(result.error)return null;
  const batches=result.data;
  if(!Array.isArray(batches)||batches.length!==after-before||batches.some((row,i)=>Number(row.revision)!==before+i+1||!Array.isArray(row.keys)))return null;
  const edits=new Map(),cleared=new Set(),changedStores=new Set(),changedKeys=[];
  for(const batch of batches)for(const key of batch.keys){
    if(!['assets','series','projects','trash','blobs','meta'].includes(key.store)||!['put','delete','clear'].includes(key.action))return null;
    changedStores.add(key.store);
    changedKeys.push({store:key.store,id:key.id,action:key.action});
    if(key.action==='clear'){cleared.add(key.store);for(const [id,value] of edits)if(value.store===key.store)edits.delete(id);}
    else{if(typeof key.id!=='string')return null;edits.set(JSON.stringify([key.store,key.id]),key);}
  }
  const patched=new Map(),blobIDs=[];
  // Each collection is independent at this revision. Fetch its changed keys
  // alongside the other collections, then verify the revision once below.
  const updates=await Promise.all(['assets','series','projects','trash','blobs','meta'].map(async store=>{
    const saved=snapshots.get(store);
    if(saved?.revision!==before)return null;
    // Advancing the account revision does not mean every collection changed.
    // Reuse untouched records rather than rebuilding a large Map for every
    // uploaded image or unrelated metadata edit.
    if(!changedStores.has(store))return [store,{revision:after,records:saved.records}];
    const records=new Map((cleared.has(store)?[]:saved.records).map(r=>[r.id,r])),puts=[];
    for(const key of edits.values())if(key.store===store){if(key.action==='delete')records.delete(key.id);else puts.push(key.id);}
    for(let offset=0;offset<puts.length;offset+=50){
      const ids=puts.slice(offset,offset+50),rows=await client.from('shiye_records').select('record').eq('user_id',owner).eq('store',store).in('id',ids).order('id').range(0,49);
      if(rows.error||rows.data.length!==ids.length)return false;
      for(const row of rows.data){if(!ids.includes(row.record?.id))return false;records.set(row.record.id,row.record);}
    }
    return [store,{revision:after,records:[...records.values()]}];
  }));
  if(updates.includes(false))return null;
  for(const update of updates)if(update)patched.set(...update);
  blobIDs.push(...[...edits.values()].filter(k=>k.store==='blobs').map(k=>k.id));
  // Reads of changes and changed records must belong to one revision.
  const check=await client.from('shiye_revisions').select('revision').eq('user_id',owner).single();
  if(check.error||Number(check.data?.revision)!==after)return null;
  return {snapshots:patched,changedStores:[...changedStores],changedKeys,blobIDs,allBlobs:cleared.has('blobs')};
}

// A pending write may follow another tab's commit only when the complete
// revision log proves that none of its records were touched. Missing logs are
// a conflict, never permission to overwrite remote data.
export async function canRebaseUnchangedKeys({client,owner,before,after,operations}){
  const count=after-before;
  if(!Number.isSafeInteger(before)||!Number.isSafeInteger(after)||count<1||!operations?.length)return false;
  // Persistent server-side per-key revision watermarks survive truncation of
  // shiye_changes. No client can declare an old write safe just because its
  // corresponding history has been trimmed.
  try {
    const start=await client.from('shiye_key_watermark_start')
      .select('start_revision').eq('user_id',owner).maybeSingle();
    if(!start.error&&start.data&&before>=Number(start.data.start_revision)){
      const grouped=new Map();
      for(const operation of operations){
        if(!operation||typeof operation.store!=='string')return false;
        const id=operation.item?.id??operation.id;
        if(operation.action!=='clear'&&typeof id!=='string')return false;
        const group=grouped.get(operation.store)||{ids:new Set(['*']),clear:false};
        if(operation.action==='clear')group.clear=true;
        else group.ids.add(id);
        grouped.set(operation.store,group);
      }
      for(const [store,group] of grouped){
        let query=client.from('shiye_key_versions')
          .select('revision').eq('user_id',owner).eq('store',store).gt('revision',before);
        if(!group.clear)query=query.in('id',[...group.ids]);
        const rows=await query.limit(1);
        if(rows.error)break; // Fall back to the complete change log below.
        if(rows.data?.length)return false; // A real same-record/clear conflict.
        grouped.delete(store);
      }
      if(!grouped.size)return true;
    }
  }catch{/* Older deployments may not have installed the additive migration. */}
  // Conservative compatibility path for an older test server. A truncated
  // log is never considered proof of non-overlap.
  if(count>250)return false;
  const result=await client.from('shiye_changes').select('revision,keys').eq('user_id',owner).gt('revision',before).lte('revision',after).order('revision').range(0,249);
  if(result.error||!Array.isArray(result.data)||result.data.length!==count)return false;
  for(let i=0;i<result.data.length;i++){
    const row=result.data[i];if(Number(row.revision)!==before+i+1||!Array.isArray(row.keys))return false;
    for(const remote of row.keys){
      if(!remote||typeof remote.store!=='string'||!['put','delete','clear'].includes(remote.action))return false;
      if(remote.action!=='clear'&&typeof remote.id!=='string')return false;
      if(operations.some(local=>local.store===remote.store&&(local.action==='clear'||remote.action==='clear'||(local.item?.id??local.id)===remote.id)))return false;
    }
  }
  return true;
}

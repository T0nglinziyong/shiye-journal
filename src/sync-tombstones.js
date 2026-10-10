// A tombstone belongs to a deleted logical record, not its 7-day trash card.
// These entries live in the existing synced meta store, so clients can
// distinguish "never created" from "intentionally deleted" after a restart.
export const DELETABLE_SYNC_STORES=new Set(['assets','series','projects']);
export const tombstoneID=(store,id)=>`tombstone:${store}:${id}`;
export function recordTombstones(operations,{now=new Date().toISOString()}={}){
  const result=[...operations],seen=new Set();
  for(const op of operations){
    if(op?.action!=='delete'||!DELETABLE_SYNC_STORES.has(op.store)||typeof op.id!=='string')continue;
    const id=tombstoneID(op.store,op.id);
    if(seen.has(id))continue;
    seen.add(id);
    // Preserve the deletion's original timestamp in a retried durable batch.
    const deletedAt=op.modifiedAt||now;
    result.push({store:'meta',action:'put',modifiedAt:deletedAt,
      item:{id,store:op.store,targetID:op.id,deletedAt,kind:'tombstone'}});
  }
  return result;
}

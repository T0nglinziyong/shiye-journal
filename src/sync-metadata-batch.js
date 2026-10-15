import {syncEnvelope} from './unified-sync-outbox.js';

// Only independent asset metadata PUTs are grouped. Image uploads, deletes,
// restores and work documents keep their existing ordering and conflict rules.
export function planMetadataBatch(rows,revision,windowSerial,{maxOperations=12,newID=()=>crypto.randomUUID()}={}){
  let group=[],operations=[],ids=new Set();
  const finish=()=>group.length>=2?{
    sourceRows:group,
    record:syncEnvelope('batch',{
      id:newID(),names:['assets'],operations,
      // Persist the inputs with the merged operation. An unconfirmed commit
      // can be checked by its merged operation ID; a real conflict can safely
      // split back into independently reviewable records.
      coalescedRows:group.map(row=>structuredClone(row))
    })
  }:null;
  for(const row of [...rows].sort((a,b)=>a.serial-b.serial)){
    if(row.serial>windowSerial)break;
    const ops=row.record?.kind==='batch'?row.record.payload?.operations:null;
    const eligible=row.baseRevision===revision&&!row.record.payload?.coalescedRows&&Array.isArray(ops)&&ops.length>0&&
      ops.every(op=>op.store==='assets'&&op.action==='put'&&typeof op.item?.id==='string'&&op.item.id&&!('data' in op.item))&&
      ops.every(op=>!ids.has(op.item.id))&&operations.length+ops.length<=maxOperations;
    if(!eligible){const result=finish();if(result)return result;group=[];operations=[];ids=new Set();continue;}
    group.push(row);operations.push(...ops);for(const op of ops)ids.add(op.item.id);
  }
  return finish();
}

export function splitMetadataBatch(record){
  const payload=record?.kind==='batch'?record.payload:null;
  if(!Array.isArray(payload?.coalescedRows)||payload.coalescedRows.length<2)return null;
  return payload.coalescedRows;
}

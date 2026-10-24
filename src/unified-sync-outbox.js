import {usableProjectSnapshot} from './project-outbox-recovery.js';

export const syncEnvelope=(kind,record)=>({
  id:(kind==='project'?'project:':'batch:')+record.id,kind,payload:record
});
// Repair a batch whose envelope was accidentally removed by the current
// reconciliation path. Keep its operation ID and payload bytes unchanged.
export function repairMiswrappedSyncRows(rows){
  let changed=false;
  const repaired=rows.map(row=>{
    const record=row?.record;
    if(record?.kind||!Array.isArray(record?.operations)||!Array.isArray(record?.names)||
      typeof record?.id!=='string'||!record.id)return row;
    changed=true;
    return {...row,record:syncEnvelope('batch',record)};
  });
  return changed?repaired:null;
}
export const unwrapSyncRow=row=>({...row,record:row.record.payload});
export const projectSyncRows=rows=>rows.filter(row=>row.record?.kind==='project').map(unwrapSyncRow);
export const importSyncRows=rows=>rows.filter(row=>row.record?.kind==='batch').map(unwrapSyncRow);

// The user's rule for genuine concurrent edits: newer explicit edit wins.
// Never compare the time when an HTTP request is retried or received.
// Missing/malformed timestamps are NOT proof that an older edit may be erased.
export function latestEditedProject(local,remote){
  const a=Date.parse(local?.updatedAt||''),b=Date.parse(remote?.updatedAt||'');
  if(!Number.isFinite(a)||!Number.isFinite(b))return 'unknown';
  return a>b?'local':'remote'; // a tie is stable: keep the existing cloud version.
}
const validRow=row=>row&&Number.isSafeInteger(row.serial)&&row.serial>=1&&
  Number.isSafeInteger(row.baseRevision)&&row.baseRevision>=0&&
  typeof row.operationID==='string'&&row.operationID.length>0;
const validBatch=b=>{
 if(!b||typeof b.id!=='string'||!b.id)return false;
 if(b.operations){
   if(!Array.isArray(b.operations)||!Array.isArray(b.names)||!b.operations.length)return false;
   return b.operations.every(op=>op&&b.names.includes(op.store)&&
     ['put','delete','clear'].includes(op.action)&&
     (op.action==='clear'||op.action==='delete'&&typeof op.id==='string'&&!!op.id||
      op.action==='put'&&typeof op.item?.id==='string'&&!!op.item.id&&
      (op.store!=='blobs'||op.item.data instanceof Blob&&op.item.data.size>0)&&
      (op.store!=='projects'||!!op.item.projectDocumentPath||usableProjectSnapshot(op.item))));
 }
 return Array.isArray(b.assets)&&Array.isArray(b.blobs)&&Array.isArray(b.projects)&&
   !!(b.assets.length||b.projects.length)&&
   b.assets.every(x=>x?.id)&&b.blobs.every(x=>x?.id)&&
   b.projects.every(usableProjectSnapshot);
};
// One account, one durable queue. Rows left by an older installed PWA are
// migrated transactionally; malformed and duplicate rows go to quarantine.
export function foldLegacySyncRows(unified=[],projects=[],imports=[],quarantine=[]){
 const next=[...(Array.isArray(unified)?unified:[])],seen=new Set(next.map(r=>r.record?.id));
 const held=[...(Array.isArray(quarantine)?quarantine:[])];
 let serial=Math.max(0,...next.map(row=>Number(row.serial)||0));
 for(const [kind,rows] of [['project',projects],['batch',imports]]){
  for(const row of Array.isArray(rows)?rows:[]){
   const record=row?.record,ok=validRow(row)&&(kind==='project'?usableProjectSnapshot(record):validBatch(record));
   if(!ok){held.push({kind,reason:'invalid-legacy-row',row});continue;}
   const envelope=syncEnvelope(kind,record);
   if(seen.has(envelope.id)){held.push({kind,reason:'duplicate-legacy-row',row});continue;}
   seen.add(envelope.id);
   next.push({...row,serial:++serial,record:envelope});
  }
 }
 return {rows:next,quarantine:held};
}
export const syncAffectedKeys=envelope=>envelope.kind==='project'
  ?[{store:'projects',id:envelope.payload.id}]
  :[
    ...(envelope.payload.operations?.map(op=>({store:op.store,id:op.item?.id??op.id}))||
      ['assets','blobs','projects'].flatMap(store=>(envelope.payload[store]||[]).map(item=>({store,id:item.id})))),
    ...(envelope.payload.dependsOnBlobIDs||[]).map(id=>({store:'blobs',id,readOnly:true}))
  ];

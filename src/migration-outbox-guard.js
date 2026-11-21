// Used only by the explicitly requested account migration. A stale global
// cursor alone is not a record conflict: protect only keys actually touched.
const key=(store,id)=>JSON.stringify([store,id]);
export function migrationPendingConflicts(changes,{projects=[],imports=[],quarantined=[]}={}){
 const changed=new Set(changes.map(row=>key(row.store,row.id)));
 const projectIDs=new Set(changes.filter(row=>row.store==='projects').map(row=>row.id));
 const deletedWorkIDs=new Set(changes.filter(row=>row.store==='trash').map(row=>row.original?.item?.id).filter(Boolean));
 const conflicts=[];
 const overlap=(store,id,item)=>changed.has(key(store,id))||
   (store==='projects'&&deletedWorkIDs.has(id))||
   (store==='trash'&&projectIDs.has(item?.item?.id))||
   (store==='meta'&&typeof id==='string'&&id.startsWith('tombstone:projects:')&&projectIDs.has(id.slice(19)));
 for(const [kind,rows] of [['pending-project',projects],['quarantined-project',quarantined]]){
  for(const row of rows){
   const id=row?.record?.id;
   if(typeof id!=='string'||!id||overlap('projects',id))conflicts.push({kind,id:id||null});
  }
 }
 for(const row of imports){
  const batch=row?.record;
  if(!batch||typeof batch!=='object'){conflicts.push({kind:'pending-batch',id:null});continue;}
  const ops=Array.isArray(batch.operations)?batch.operations:
   ['assets','blobs','projects'].flatMap(store=>(batch[store]||[]).map(item=>({store,action:'put',item})));
  if(!ops.length){conflicts.push({kind:'pending-batch',id:batch.id||null});continue;}
  const dangerous=ops.some(op=>{
   const id=op?.item?.id??op?.id;
   if(!op||typeof op.store!=='string'||!['put','delete','clear'].includes(op.action))return true;
   if(op.action==='clear')return changes.some(c=>c.store===op.store);
   if(typeof id!=='string'||!id)return true;
   return overlap(op.store,id,op.item);
  });
  if(dangerous)conflicts.push({kind:'pending-batch',id:batch.id||null});
 }
 return conflicts;
}

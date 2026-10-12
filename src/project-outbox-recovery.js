// Scene v2 outbox recovery: only complete recursive layer trees are replayable.
// Corrupted data stays quarantined in the durable account queue for manual recovery.
const validTree=(nodes,seen=new Set(),depth=0)=>{
 if(!Array.isArray(nodes)||depth>12||nodes.length>5000)return false;
 for(const node of nodes){
  if(!node||typeof node.id!=='string'||!node.id||seen.has(node.id)||
      !['material','text','shape','ink','group'].includes(node.type))return false;
  seen.add(node.id);
  if(node.type==='group'&&!validTree(node.children,seen,depth+1))return false;
 }
 return true;
};
export function usableProjectSnapshot(project){
 if(!project||typeof project.id!=='string'||!project.id||project.projectDocumentPath)return false;
 if(!Array.isArray(project.drafts)||!project.drafts.length||
   !project.drafts.some(draft=>draft?.id===project.activeDraftID))return false;
 return project.drafts.every(draft=>draft&&typeof draft.id==='string'&&
   Number.isFinite(draft.canvas?.width)&&draft.canvas.width>0&&
   Number.isFinite(draft.canvas?.height)&&draft.canvas.height>0&&
   draft.sceneVersion===2&&validTree(draft.layers));
}
export function recoverProjectOutbox(rows){
 const valid=[],quarantined=[];
 for(const row of rows||[]){
  if(usableProjectSnapshot(row?.record)&&Number.isSafeInteger(row.serial)&&row.serial>0&&
     Number.isSafeInteger(row.baseRevision)&&row.baseRevision>=0)valid.push(row);
  else quarantined.push(row);
 }
 // Never convert old draft arrays. More importantly, do not erase unsynced
 // invalid records: preserve their raw bytes in the local durable queue so
 // they can be recovered manually. Only *valid* Scene v2 rows are replayable.
 return {rows:valid,quarantined,removed:quarantined.length};
}

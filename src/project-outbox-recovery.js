import {prepareProjectScene} from './scene-v2.js';
// Offline outbox must accept the same canonical persisted Scene v2 as
// local/remote project documents. A missing legacy items[] array is NOT
// damage and must never cause an unsynced user edit to be discarded.
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
 const kept=(rows||[]).filter(row=>{
  // Safely upgrade an offline v1 edit into the same saved v2 tree before
  // checking it. Never discard an otherwise complete pending user drawing
  // merely because a new release removed four legacy leaf-array keys.
  if(row?.record){
   // An incomplete v1 outbox must NOT become a seemingly complete empty v2
   // document during migration. Only a complete four-array v1 draft may migrate.
   for(const d of row.record.drafts||[]){
    if(!Array.isArray(d?.layers)&&
      !['items','textBlocks','primitives','strokes'].every(key=>Array.isArray(d?.[key])))return false;
   }
   try{prepareProjectScene(row.record);}catch{return false;}
  }
  return usableProjectSnapshot(row?.record)&&Number.isSafeInteger(row.serial)&&row.serial>0&&Number.isSafeInteger(row.baseRevision)&&row.baseRevision>=0;
 });
 return {rows:kept,removed:(rows||[]).length-kept.length};
}

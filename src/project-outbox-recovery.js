// A partial IndexedDB write must never replace the last acknowledged cloud
// document. Keep only complete editor snapshots; absent or damaged local edits
// fall back to the saved project returned by the cloud collection.
export function usableProjectSnapshot(project){
  if(!project||typeof project.id!=='string'||!project.id||project.projectDocumentPath)return false;
  if(!Array.isArray(project.drafts)||!project.drafts.length)return false;
  if(!project.drafts.some(draft=>draft?.id===project.activeDraftID))return false;
  return project.drafts.every(draft=>draft&&typeof draft.id==='string'&&
    Number.isFinite(draft.canvas?.width)&&draft.canvas.width>0&&
    Number.isFinite(draft.canvas?.height)&&draft.canvas.height>0&&
    ['items','textBlocks','primitives','strokes'].every(key=>Array.isArray(draft[key])));
}

export function recoverProjectOutbox(rows){
  const kept=(rows||[]).filter(row=>usableProjectSnapshot(row?.record));
  return {rows:kept,removed:(rows||[]).length-kept.length};
}

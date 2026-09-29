import {snapshotDraft} from './draft-snapshot.js';
// Recover missing pre-upgrade restore points without replacing edited artwork.
// Only explicit, locally supplied native CeCe references are accepted.
export function prepareHistoryReferences(data,projects,assets){
  if(data.format!=='shiye-history-references'||data.version!==1||data.sourceIdentifier!=='cece-native-goodnotes-v1'||!Array.isArray(data.projects)||data.projects.length!==4||new Set(data.projects.map(p=>p.id)).size!==4)throw Error('不是有效的四页原生历史参考包');
  const assetIDs=new Set(assets.map(a=>a.id));
  return data.projects.map(reference=>{
    const p=projects.find(p=>p.id===reference.id);
    if(!/^cece-p[1-4]-project$/.test(reference.id)||!p||p.sourceIdentifier!==data.sourceIdentifier||!Array.isArray(reference.drafts)||!reference.drafts.length||!reference.drafts.some(d=>d.id===reference.activeDraftID))throw Error('历史参考与现有作品不匹配');
    const versions={...p.draftHistorySnapshots};
    for(const d of reference.drafts){if(!p.drafts.some(row=>row.id===d.id)||!d.canvas||![d.canvas.width,d.canvas.height].every(n=>Number.isFinite(n)&&n>0&&n<10000)||!['items','primitives','textBlocks','strokes'].every(k=>Array.isArray(d[k]))||d.items.some(i=>!assetIDs.has(i.assetID)))throw Error('历史参考的对象或素材不完整');versions[d.id]=snapshotDraft(d);}
    return {...p,initialEditorSnapshot:{drafts:reference.drafts.map(snapshotDraft),activeDraftID:reference.activeDraftID},draftHistorySnapshots:versions,historyReferenceIdentifier:'cece-native-goodnotes-v1-original'};
  });
}
export async function importHistoryReferences(file,db){
  if(file.size>150*1024*1024)throw Error('历史参考包过大');
  const data=JSON.parse(await file.text());await db.flushProjects?.();
  const backup=JSON.parse(await (await db.createBackup()).text());
  if(backup.format!=='shiye-pwa'||!['assets','blobs','projects','series','meta','trash'].every(k=>Array.isArray(backup.stores?.[k])))throw Error('完整备份验证失败，未改写作品');
  const updated=prepareHistoryReferences(data,backup.stores.projects,backup.stores.assets);
  await (db.confirmedTransaction||db.transaction)(['projects'],tx=>updated.forEach(p=>tx.objectStore('projects').put(p)));
  return updated.length;
}

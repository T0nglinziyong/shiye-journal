const NAMESPACE='cece-native-goodnotes-v1';
const projectID=id=>/^cece-p[1-4]-project$/.test(id);
function imageBlob(record){
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(record.data||'');if(!match)throw Error('私人作品包中有无效图片');
  const bytes=Uint8Array.from(atob(match[2]),char=>char.charCodeAt(0));return {...record,data:new Blob([bytes],{type:match[1]})};
}
export function validatePrivateCollection(data){
  if(data.format!=='shiye-private-collection'||data.version!==1||data.namespace!==NAMESPACE||data.series?.id!=='cece-sample-series')throw Error('不是受支持的 Goodnotes 私人作品包');
  if(!['assets','blobs','projects'].every(key=>Array.isArray(data[key]))||data.projects.length!==4||new Set(data.projects.map(p=>p.id)).size!==4||data.projects.some(p=>!projectID(p.id)||p.sourceIdentifier!==NAMESPACE))throw Error('私人作品包必须包含四份完整的原生作品');
  const blobs=data.blobs.map(imageBlob),ids=new Set(blobs.map(b=>b.id)),assets=new Set(data.assets.map(a=>a.id));
  if(ids.size!==blobs.length||assets.size!==data.assets.length||data.assets.some(a=>!a.id.startsWith('cece-native-')||a.staticPath||!ids.has(a.blobId)||a.sourceIdentifier!==NAMESPACE))throw Error('私人素材或图片引用不完整');
  for(const p of data.projects){if(!Array.isArray(p.drafts)||!p.drafts.length||!p.drafts.some(d=>d.id===p.activeDraftID))throw Error('私人作品方案不完整');for(const d of p.drafts){if(!d.canvas||![d.canvas.width,d.canvas.height].every(n=>Number.isFinite(n)&&n>0&&n<10000)||!['items','textBlocks','primitives','strokes'].every(key=>Array.isArray(d[key])))throw Error('私人作品画布不完整');if(d.items.some(i=>!assets.has(i.assetID)))throw Error('私人作品引用了缺失素材');}}
  return {...data,blobs};
}
export async function importPrivateCollection(file,{db,onProgress=()=>{},prepare=()=>{}}){
  if(file.size>150*1024*1024)throw Error('私人作品包超过150 MB');
  const data=validatePrivateCollection(JSON.parse(await file.text()));
  await prepare(data);
  await db.flushProjects?.();onProgress('正在核对迁移前资料…');
  // Keep a verified in-memory snapshot until atomic commit. No old private
  // files are published, and no unrelated project is part of the replacement.
  const backup=JSON.parse(await (await db.createBackup()).text());
  if(backup.format!=='shiye-pwa'||!backup.stores||!['assets','blobs','projects','series','meta','trash'].every(key=>Array.isArray(backup.stores[key])))throw Error('迁移前完整快照无法读取，未替换任何资料');
  const removed=backup.stores.projects.filter(p=>projectID(p.id)||/^cece-p[1-4]-project-reference-v\d+$/.test(p.id)&&p.styleTags?.includes('CeCe样例'));
  const removedIDs=new Set(removed.map(p=>p.id));
  const otherProjects=[...backup.stores.projects.filter(p=>!removedIDs.has(p.id)),...backup.stores.trash.filter(row=>row.kind==='project'&&!removedIDs.has(row.item?.id)).map(row=>row.item)];
  const stillUsed=new Set(otherProjects.flatMap(p=>p.drafts||[]).flatMap(d=>(d.items||[]).map(i=>i.assetID)));
  const oldAssets=backup.stores.assets.filter(a=>a.seriesID==='cece-sample-series'&&!stillUsed.has(a.id));
  const keepBlobIDs=new Set(backup.stores.assets.filter(a=>!oldAssets.includes(a)).flatMap(a=>[a.blobId,a.originalBlobId,a.originalCutoutBlobId].filter(Boolean)));
  for(const project of otherProjects)for(const draft of project.drafts||[])if(draft.coverBlobId)keepBlobIDs.add(draft.coverBlobId);
  const oldBlobs=new Set(oldAssets.flatMap(a=>[a.blobId,a.originalBlobId,a.originalCutoutBlobId].filter(id=>id&&!keepBlobIDs.has(id))));
  onProgress('正在保存四页原生作品和私人素材…');
  await db.transaction(['assets','blobs','projects','series','meta'],tx=>{
    for(const p of removed)tx.objectStore('projects').delete(p.id);
    for(const a of oldAssets)tx.objectStore('assets').delete(a.id);
    for(const id of oldBlobs)tx.objectStore('blobs').delete(id);
    for(const a of data.assets)tx.objectStore('assets').put(a);
    for(const b of data.blobs)tx.objectStore('blobs').put(b);
    for(const p of data.projects)tx.objectStore('projects').put(p);
    tx.objectStore('series').put(data.series);tx.objectStore('meta').put({id:NAMESPACE,importedAt:new Date().toISOString()});
  });
  return {projects:data.projects.length,assets:data.assets.length};
}

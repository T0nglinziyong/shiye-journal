// A removed library card remains resolvable by an existing scene. It is not
// offered as a new material, and restoring the trash item restores its card.
export function hiddenAssetCopy(asset,at=new Date().toISOString()){
  return {...asset,isProjectInternal:true,hiddenFromLibraryAt:at};
}
export function visibleMaterials(assets){return assets.filter(asset=>!asset.isProjectInternal);}

function containsID(value,ids,found,seen=new WeakSet()){
  if(typeof value==='string'){if(ids.has(value))found.add(value);return;}
  if(!value||typeof value!=='object'||value instanceof Blob||seen.has(value))return;
  seen.add(value);
  for(const child of Object.values(value))containsID(child,ids,found,seen);
}

// Incomplete project documents, pending uploads or damaged archives mean
// "unknown", never permission to discard a work's source image.
export async function referencedHiddenAssetIDs({db,assets,trash=[],candidateIDs=null}){
  const ids=candidateIDs||new Set(assets.filter(a=>a.hiddenFromLibraryAt).map(a=>a.id)),found=new Set();
  if(!ids.size)return found;
  const rows=await db.all('projects');
  const pending=typeof db.pendingProjects==='function'?await db.pendingProjects():[];
  const details=typeof db.pendingSyncDetails==='function'?await db.pendingSyncDetails():null;
  if(details?.batches?.length||details?.quarantined)throw Error('待同步资料尚未核对，隐藏图片暂不清理');
  const projects=[...rows,...trash.filter(row=>row.kind==='project').map(row=>row.item),
    ...pending.map(row=>row.record||row)];
  for(const source of projects){
    const project=await db.completeProject(source);
    containsID(project,ids,found);
    if(project.manualArchives?.length){
      const {readArchivePayload}=await import('./scene-archive.js');
      for(const archive of project.manualArchives){
        const payload=project.manualArchiveStore?.[archive.ref];
        if(!payload)throw Error('作品存档不完整，隐藏图片暂不清理');
        containsID(readArchivePayload(payload,archive.ref),ids,found);
      }
    }
  }
  return found;
}

export async function pruneUnreferencedHiddenAssets({db,state,now=Date.now(),minAgeMs=7*86400000}){
  const inTrash=new Set(state.trash.filter(row=>row.kind==='asset').map(row=>row.item.id));
  const candidates=state.assets.filter(asset=>asset.hiddenFromLibraryAt&&!inTrash.has(asset.id)&&
    Number.isFinite(Date.parse(asset.hiddenFromLibraryAt))&&now-Date.parse(asset.hiddenFromLibraryAt)>=minAgeMs);
  if(!candidates.length)return 0;
  const used=await referencedHiddenAssetIDs({db,assets:state.assets,trash:state.trash});
  const unused=candidates.filter(asset=>!used.has(asset.id));
  if(!unused.length)return 0;
  await db.transaction(['assets'],tx=>{for(const asset of unused)tx.objectStore('assets').delete(asset.id);});
  const removed=new Set(unused.map(asset=>asset.id));
  state.assets=state.assets.filter(asset=>!removed.has(asset.id));
  return unused.length;
}

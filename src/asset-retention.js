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

export async function referencedAssetIDsInProjects({db,projects,ids}){
  const found=new Set();
  if(!ids.size)return found;
  for(const source of projects){
    const project=await db.completeProject(source);
    containsID(project,ids,found);
    if(project.manualArchives?.length){
      const {readArchivePayload}=await import('./scene-archive.js');
      for(const archive of project.manualArchives){
        const payload=project.manualArchiveStore?.[archive.ref];
        if(!payload)throw Error('作品存档不完整，暂不能删除关联素材');
        containsID(readArchivePayload(payload,archive.ref),ids,found);
      }
    }
  }
  return found;
}

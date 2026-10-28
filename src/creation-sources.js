import {sceneLayerEntries} from './scene-v2.js';

// Read the authoritative tree, including hidden/parked leaves and local groups.
// The transient `items` view is not present after structuredClone/persistence.
export function sceneMaterialIDs(draft){
  return [...new Set(sceneLayerEntries(draft,{hidden:true,ink:false})
    .filter(entry=>entry.kind==='material').map(entry=>entry.value.assetID))];
}

export function creativeSourceIDs({project,draft,basket=[]}){
  const scope=project.materialPriority;
  const candidates=[...(project.candidateAssetIDs||[]),...(scope?[]:basket)]
    .filter(id=>!scope?.excluded?.includes(id));
  // Excluding a new candidate must not erase the source of an existing layer.
  return [...new Set([...candidates,...sceneMaterialIDs(draft)])];
}

export function assertCreativeSources(ids,assets){
  const available=new Set(assets.map(asset=>asset.id));
  if(ids.some(id=>!available.has(id)))throw Error('当前作品或候选中有无法读取的素材来源，请恢复素材后再创作；未忽略已有图层');
}

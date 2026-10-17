import {readArchivePayload} from './scene-archive.js';

const archiveImageCache=new Map();
function archiveImageIDs(payload,hash){
  if(archiveImageCache.has(hash))return archiveImageCache.get(hash);
  const ids=new Set();
  const visit=nodes=>{for(const node of nodes||[]){
    if(node?.type==='material'&&node.sourceBlobId)ids.add(node.sourceBlobId);
    if(node?.type==='group')visit(node.children);
  }};
  for(const draft of readArchivePayload(payload,hash))visit(draft.layers);
  const result=[...ids];archiveImageCache.set(hash,result);
  if(archiveImageCache.size>80)archiveImageCache.delete(archiveImageCache.keys().next().value);
  return result;
}

// Keep source IDs in the small project summary. A large editable document is
// stored separately, while the server's orphan collector only sees summaries.
export function sceneMaterialIDs(project){
  const ids=new Set();
  const visit=nodes=>{
    for(const node of nodes||[]){
      if(node?.type==='material'&&typeof node.assetID==='string'&&node.assetID)ids.add(node.assetID);
      if(node?.type==='group')visit(node.children);
    }
  };
  for(const draft of project?.drafts||[])visit(draft?.layers);
  return [...ids].sort();
}

export function sceneMaterialBlobIDs(project){
  const ids=new Set();
  const visit=nodes=>{
    for(const node of nodes||[]){
      if(node?.type==='material'&&typeof node.sourceBlobId==='string'&&node.sourceBlobId)
        ids.add(node.sourceBlobId);
      if(node?.type==='group')visit(node.children);
    }
  };
  const drafts=source=>{for(const draft of source?.drafts||[])visit(draft?.layers);};
  drafts(project);
  drafts(project?.initialEditorSnapshot);
  drafts(project?.manualEditorSnapshot);
  for(const draft of Object.values(project?.draftHistorySnapshots||{}))visit(draft?.layers);
  for(const archive of project?.manualArchives||[]){
    const payload=project?.manualArchiveStore?.[archive.ref];
    if(!payload)continue;
    try{for(const id of archiveImageIDs(payload,archive.ref))ids.add(id);}
    catch{/* An unreadable archive cannot be restored; it must not block the current work's sync. */}
  }
  for(const archive of project?.autoSceneSnapshots||[]){
    const payload=project?.autoSceneSnapshotStore?.[archive.hash];
    if(!payload)continue;
    try{for(const id of archiveImageIDs(payload,archive.hash))ids.add(id);}
    catch{/* The current Scene and other valid snapshots remain protected. */}
  }
  for(const operation of project?.sceneOperations||[]){
    for(const change of operation?.delta?.nodes||[]){
      for(const side of ['before','after']){
        const node=change[side];
        if(node?.type==='material'&&typeof node.sourceBlobId==='string')ids.add(node.sourceBlobId);
      }
      for(const field of change.fields||[])if(field.key==='sourceBlobId')
        for(const side of ['before','after'])if(typeof field[side]==='string')ids.add(field[side]);
    }
  }
  return [...ids].sort();
}

// Give older editable scenes an explicit image version the next time they are
// saved. Once set, the reference is never refreshed from the library record.
export function pinProjectMaterialImages(project,resolveAsset){
  let changed=false;
  const visit=nodes=>{
    for(const node of nodes||[]){
      if(node?.type==='group'){visit(node.children);continue;}
      if(node?.type!=='material'||node.sourceBlobId||node.sourceStaticPath)continue;
      const source=resolveAsset(node.assetID);
      if(source?.staticPath){node.sourceStaticPath=source.staticPath;changed=true;}
      else if(source?.blobId){node.sourceBlobId=source.blobId;changed=true;}
    }
  };
  const drafts=source=>{for(const draft of source?.drafts||[])visit(draft?.layers);};
  drafts(project);drafts(project?.initialEditorSnapshot);drafts(project?.manualEditorSnapshot);
  for(const draft of Object.values(project?.draftHistorySnapshots||{}))visit(draft?.layers);
  return changed;
}

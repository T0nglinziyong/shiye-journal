// A forced browser termination may restore import metadata without the Blob
// that the card actually displays. A surviving source photo alone cannot
// render the extracted material; a surviving cutout can.
import {usableProjectSnapshot} from './project-outbox-recovery.js';
const imageIDs=asset=>[asset.blobId,asset.originalCutoutBlobId,asset.originalBlobId,asset.photoBlobId].filter(Boolean);
const displayIDs=asset=>[asset.blobId,asset.originalCutoutBlobId,asset.originalBlobId].filter(Boolean);
const usable=value=>value instanceof Blob&&value.size>0;
function validMutation(op,names){
  if(!op||!names.includes(op.store)||!['put','delete','clear'].includes(op.action))return false;
  if(op.action==='delete')return !!op.id;
  if(op.action==='clear')return true;
  if(!op.item?.id)return false;
  if(op.store==='blobs')return usable(op.item.data);
  if(op.store==='projects'&&!op.item.projectDocumentPath)return usableProjectSnapshot(op.item);
  return true;
}

function availableIDs(answer,ids){
  if(answer===true)return new Set(ids);
  if(answer===false)return new Set();
  if(Array.isArray(answer))return new Set(answer);
  if(answer instanceof Set)return answer;
  return null; // Network failure is not proof of loss.
}

export async function recoverImportOutbox(rows,remoteHas){
  let removed=0,changed=false;
  const recovered=[];
  for(const row of rows||[]){
    const batch=row?.record;
    if(!batch||typeof batch.id!=='string'||!batch.id||!Number.isSafeInteger(row.serial)||row.serial<1||!Number.isSafeInteger(row.baseRevision)||row.baseRevision<0){changed=true;removed++;continue;}
    if(batch.operations){
      // An interrupted IndexedDB write can leave only the envelope. Do not
      // replay an incomplete delete/replace operation against good cloud data.
      if(!Array.isArray(batch.operations)||!Array.isArray(batch.names)||batch.operations.some(op=>!validMutation(op,batch.names))){changed=true;removed++;continue;}
      recovered.push(row);continue;
    }
    if(!Array.isArray(batch.assets)||!Array.isArray(batch.blobs)||!Array.isArray(batch.projects)||!batch.assets.length&&!batch.projects.length){changed=true;removed++;continue;}
    if(batch.projects.some(project=>!usableProjectSnapshot(project))){changed=true;removed++;continue;}
    const blobs=new Map((batch.blobs||[]).map(blob=>[blob.id,blob.data]));
    let uncertain=false,rowChanged=false,removedInRow=0;
    const assets=await Promise.all(batch.assets.map(async asset=>{
      const candidates=displayIDs(asset),local=candidates.find(id=>usable(blobs.get(id)));
      if(local){if(local!==asset.blobId){rowChanged=true;return {...asset,blobId:local};}return asset;}
      let remote;
      try{remote=availableIDs(await remoteHas(asset,imageIDs(asset)),imageIDs(asset));}catch{remote=null;}
      if(remote===null){uncertain=true;return asset;}
      const copy=candidates.find(id=>remote.has(id));
      if(copy){if(copy!==asset.blobId){rowChanged=true;return {...asset,blobId:copy};}return asset;}
      removedInRow++;rowChanged=true;return null;
    }));
    if(uncertain){recovered.push(row);continue;}
    removed+=removedInRow;changed||=rowChanged;
    const kept=assets.filter(Boolean);
    // A work import is one editable document. If its background or any
    // referenced cutout is truly gone, keep the last cloud document instead
    // of publishing a new project whose canvas contains missing images.
    if(batch.projects.length&&removedInRow){changed=true;continue;}
    if(!kept.length){changed=true;continue;}
    const needed=new Set(kept.flatMap(imageIDs));
    const safeBlobs=(batch.blobs||[]).filter(blob=>needed.has(blob.id)&&usable(blob.data));
    if(safeBlobs.length!==(batch.blobs||[]).length)rowChanged=changed=true;
    recovered.push(rowChanged?{...row,record:{...batch,assets:kept,blobs:safeBlobs}}:row);
  }
  return {rows:recovered,removed,changed};
}

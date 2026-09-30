// A forced browser termination may restore import metadata without the Blob
// that the card actually displays. A surviving source photo alone cannot
// render the extracted material; a surviving cutout can.
const imageIDs=asset=>[asset.blobId,asset.originalCutoutBlobId,asset.originalBlobId,asset.photoBlobId].filter(Boolean);
const displayIDs=asset=>[asset.blobId,asset.originalCutoutBlobId,asset.originalBlobId].filter(Boolean);
const usable=value=>value instanceof Blob&&value.size>0;

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
    const batch=row.record;
    if(batch.operations||batch.projects?.length||!batch.assets?.length){recovered.push(row);continue;}
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
    if(!kept.length)continue;
    const needed=new Set(kept.flatMap(imageIDs));
    const safeBlobs=(batch.blobs||[]).filter(blob=>needed.has(blob.id)&&usable(blob.data));
    if(safeBlobs.length!==(batch.blobs||[]).length)rowChanged=changed=true;
    recovered.push(rowChanged?{...row,record:{...batch,assets:kept,blobs:safeBlobs}}:row);
  }
  return {rows:recovered,removed,changed};
}

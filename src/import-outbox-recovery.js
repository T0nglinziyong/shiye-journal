// A forced browser termination may restore the import metadata but not the
// underlying IndexedDB Blobs. Only discard a card when *all* of its local
// image sources are gone and the cloud has no record for any of them.
const imageIDs=asset=>[asset.blobId,asset.originalBlobId,asset.originalCutoutBlobId,asset.photoBlobId].filter(Boolean);
const usable=value=>value instanceof Blob&&value.size>0;

export async function recoverImportOutbox(rows,remoteHas){
  let removed=0;
  const recovered=[];
  for(const row of rows||[]){
    const batch=row.record;
    if(batch.operations||batch.projects?.length||!batch.assets?.length){recovered.push(row);continue;}
    const blobs=new Map((batch.blobs||[]).map(blob=>[blob.id,blob.data]));
    const assets=[];
    for(const asset of batch.assets){
      const ids=imageIDs(asset);
      if(ids.some(id=>usable(blobs.get(id)))){assets.push(asset);continue;}
      // A failed network/authorization probe is not evidence of data loss.
      let exists=true;
      try{exists=await remoteHas(asset,ids);}catch{}
      if(exists)assets.push(asset);else removed++;
    }
    if(!assets.length)continue;
    if(assets.length===batch.assets.length){recovered.push(row);continue;}
    const needed=new Set(assets.flatMap(imageIDs));
    recovered.push({...row,record:{...batch,assets,blobs:(batch.blobs||[]).filter(blob=>needed.has(blob.id))}});
  }
  return {rows:recovered,removed};
}

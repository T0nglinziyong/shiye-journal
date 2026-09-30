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
    const keep=await Promise.all(batch.assets.map(async asset=>{
      const ids=imageIDs(asset);
      if(ids.some(id=>usable(blobs.get(id))))return true;
      // A failed network/authorization probe is not evidence of data loss.
      try{return await remoteHas(asset,ids)!==false;}catch{return true;}
    }));
    const assets=batch.assets.filter((_,index)=>keep[index]);
    removed+=batch.assets.length-assets.length;
    if(!assets.length)continue;
    if(assets.length===batch.assets.length){recovered.push(row);continue;}
    const needed=new Set(assets.flatMap(imageIDs));
    recovered.push({...row,record:{...batch,assets,blobs:(batch.blobs||[]).filter(blob=>needed.has(blob.id))}});
  }
  return {rows:recovered,removed};
}

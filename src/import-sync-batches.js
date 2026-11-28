export const assetBlobIDs=asset=>[asset?.blobId,asset?.originalCutoutBlobId,asset?.originalBlobId,
  asset?.candidateFrameBlobId,asset?.initialMaskBlobId,asset?.finalMaskBlobId,asset?.photoBlobId]
  .filter(Boolean);

// Bulk tag/usage changes do not require one giant JSON/RPC body. Each record
// has a distinct key, so only pure metadata PUTs may be split this way.
export function splitWideMetadataMutation(batch,{newID=()=>crypto.randomUUID(),limit=8}={}){
  const ops=batch?.operations;
  if(!Array.isArray(ops)||ops.length<=limit||!ops.every(op=>
    op.action==='put'&&['assets','series'].includes(op.store)&&
    typeof op.item?.id==='string'&&op.item.id&&!(op.item.data instanceof Blob)))return [batch];
  const keys=new Set(ops.map(op=>op.store+'\0'+op.item.id));
  if(keys.size!==ops.length)return [batch];
  const chunks=[];
  for(let offset=0;offset<ops.length;offset+=limit){
    const operations=ops.slice(offset,offset+limit);
    chunks.push({...batch,id:newID(),operations,
      names:[...new Set(operations.map(op=>op.store))]});
  }
  return chunks;
}

// A library import is locally atomic. Cloud records can be committed in
// smaller, durable steps once shared source bytes have their own receipt.
export function splitIndependentAssetImport(batch,{newID=()=>crypto.randomUUID()}={}){
  const assets=batch?.assets,blobs=batch?.blobs,projects=batch?.projects;
  if(!Array.isArray(assets)||assets.length<2||!Array.isArray(blobs)||
    !Array.isArray(projects)||projects.length)return [batch];
  const blobByID=new Map(blobs.map(blob=>[blob?.id,blob]));
  if(blobByID.size!==blobs.length||blobByID.has(undefined))return [batch];
  const references=assets.map(asset=>new Set(assetBlobIDs(asset)));
  const referenced=new Set(references.flatMap(ids=>[...ids]));
  // Unknown batch-level bytes may carry semantics not represented by an asset
  // field. Preserve the original transaction rather than guessing ownership.
  if(blobs.some(blob=>!referenced.has(blob.id)))return [batch];
  const referenceCounts=new Map();
  for(const ids of references)for(const id of ids)
    referenceCounts.set(id,(referenceCounts.get(id)||0)+1);
  const shared=new Set([...referenceCounts].filter(([,count])=>count>1).map(([id])=>id));
  // A shared reference absent from the import may be a pre-existing cloud
  // object. Keep the original transaction rather than inventing a receipt.
  if([...shared].some(id=>!blobByID.has(id)))return [batch];
  if(shared.size){
    const parts=[];
    const common=blobs.filter(blob=>shared.has(blob.id));
    // A source photo can be used by dozens of cutouts. Keep each receipt and
    // HTTP body bounded; the dependent cards remain behind these rows.
    for(let offset=0;offset<common.length;offset+=8){
      const chunk=common.slice(offset,offset+8);
      parts.push({id:newID(),names:['blobs'],operations:chunk.map(item=>
        ({store:'blobs',action:'put',item}))});
    }
    for(let index=0;index<assets.length;index++){
      const ids=references[index];
      parts.push({...batch,id:newID(),assets:[assets[index]],
        blobs:blobs.filter(blob=>ids.has(blob.id)&&!shared.has(blob.id)),
        projects:[],dependsOnBlobIDs:[...ids].filter(id=>shared.has(id))});
    }
    return parts;
  }
  const parent=assets.map((_,index)=>index);
  const root=index=>{while(parent[index]!==index){parent[index]=parent[parent[index]];index=parent[index];}return index;};
  const join=(a,b)=>{a=root(a);b=root(b);if(a!==b)parent[b]=a;};
  const owner=new Map();
  references.forEach((ids,index)=>{for(const id of ids){if(owner.has(id))join(index,owner.get(id));else owner.set(id,index);}});
  const groups=new Map();
  assets.forEach((asset,index)=>{const key=root(index);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(index);});
  if(groups.size<2)return [batch];
  return [...groups.values()].map(indices=>{
    const ids=new Set(indices.flatMap(index=>[...references[index]]));
    return {...batch,id:newID(),assets:indices.map(index=>assets[index]),
      blobs:blobs.filter(blob=>ids.has(blob.id)),projects:[]};
  });
}

// Convert durable batches created by an older client without changing any
// asset/blob payload. A server receipt for the original operation always wins:
// that row must first follow the normal acknowledgement recovery path.
export async function splitPendingAssetImportRows(rows,{isCommitted=async()=>false,
  newID=()=>crypto.randomUUID(),newOperationID=()=>crypto.randomUUID()}={}){
  let changed=false,nextSerial=0;
  const output=[];
  for(const row of [...(rows||[])].sort((a,b)=>a.serial-b.serial)){
    const envelope=row?.record,batch=envelope?.kind==='batch'?envelope.payload:null;
    const parts=batch?splitIndependentAssetImport(batch,{newID})
      .flatMap(part=>splitWideMetadataMutation(part,{newID})):[batch];
    if(!batch||parts.length<2||await isCommitted(row)){
      nextSerial=Math.max(nextSerial+1,row.serial);
      output.push({...row,serial:nextSerial});
      continue;
    }
    changed=true;
    parts.forEach((part,index)=>{
      // Keep every child directly before later edits of those assets. The old
      // maxSerial append let an AI rename reach the cloud before its image
      // import, leaving the original bytes in a permanent same-key conflict.
      nextSerial=Math.max(nextSerial+1,index?0:row.serial);
      const next={...row,serial:nextSerial,
        operationID:newOperationID(),record:{...envelope,id:'batch:'+part.id,payload:part}};
      delete next.attempt;delete next.nextAttemptAt;delete next.lastFailureClass;
      output.push(next);
    });
  }
  return changed?output:null;
}

// An older client can upload an AI-enriched asset record before the original
// import's image records. Recover only when the cloud asset still points to
// exactly the same image IDs; retain its newer descriptive fields and upload
// the missing bytes from the durable local batch.
export async function reconcileInterruptedAssetImport(batch,readRemote){
  if(!Array.isArray(batch?.assets)||!batch.assets.length||
    !Array.isArray(batch.blobs)||!Array.isArray(batch.projects)||batch.projects.length)
    return null;
  const imageFields=['blobId','originalCutoutBlobId','originalBlobId',
    'candidateFrameBlobId','initialMaskBlobId','finalMaskBlobId','photoBlobId'];
  const operations=[];
  for(const asset of batch.assets){
    const remote=await readRemote('assets',asset.id);
    if(!remote){operations.push({store:'assets',action:'put',item:asset});continue;}
    if(imageFields.some(key=>(asset[key]??null)!==(remote[key]??null))||
      asset.imageHash&&remote.imageHash&&asset.imageHash!==remote.imageHash)
      return null;
  }
  for(const blob of batch.blobs){
    // Blob metadata alone cannot prove that its backing COS object exists.
    // Re-send the durable original bytes under the same content hash even if
    // a prior response wrote the metadata before disappearing.
    operations.push({store:'blobs',action:'put',item:blob});
  }
  return operations;
}

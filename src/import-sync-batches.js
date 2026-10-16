const assetBlobIDs=asset=>[asset?.blobId,asset?.originalCutoutBlobId,asset?.originalBlobId,
  asset?.candidateFrameBlobId,asset?.initialMaskBlobId,asset?.finalMaskBlobId,asset?.photoBlobId]
  .filter(Boolean);

// A library import is locally atomic, but unrelated materials must be able to
// reach the cloud independently. Keep assets sharing source bytes together so
// their references are never published without the same blob component.
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
  let changed=false,maxSerial=Math.max(0,...(rows||[]).map(row=>Number(row?.serial)||0));
  const output=[];
  for(const row of rows||[]){
    const envelope=row?.record,batch=envelope?.kind==='batch'?envelope.payload:null;
    const parts=batch?splitIndependentAssetImport(batch,{newID}):[batch];
    if(!batch||parts.length<2||await isCommitted(row)){output.push(row);continue;}
    changed=true;
    parts.forEach((part,index)=>{
      const next={...row,serial:index?++maxSerial:row.serial,
        operationID:newOperationID(),record:{...envelope,id:'batch:'+part.id,payload:part}};
      delete next.attempt;delete next.nextAttemptAt;delete next.lastFailureClass;
      output.push(next);
    });
  }
  return changed?output:null;
}

// Recognition receives a cover-sized source. A missing cover is an error;
// falling through to the original would hide a broken preview path and make
// paid model requests much larger than the user expects.
export async function loadModelImageSource(asset,{preview,original,reload,fetchStatic,cloud=false},{coverOnly=false,edge=512}={}){
  if(coverOnly){
    const cover=asset.blobId?await preview(asset.blobId,edge):
      asset.staticPath?await fetchStatic(asset.staticPath):null;
    if(!cover)throw Error('素材封面无法读取，请稍后重试或检查同步详情');
    return cover;
  }
  let blob;
  try{blob=asset.blobId?await original(asset.blobId):null;}
  catch(error){
    if(!cloud||!asset.blobId)throw error;
    blob=await reload(asset.blobId);
    if(!blob)throw error;
  }
  if(blob)return blob;
  return asset.staticPath?await fetchStatic(asset.staticPath):null;
}

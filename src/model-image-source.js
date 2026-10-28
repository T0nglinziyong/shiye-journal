// All model requests use an account-scoped cover or a requested COS display
// derivative. Remote originals are never fetched to prepare model input.
export async function loadModelImageSource(asset,{preview,fetchStatic},{edge=512}={}){
  const cover=asset.blobId?await preview(asset.blobId,edge):
    asset.staticPath?await fetchStatic(asset.staticPath):null;
  if(!(cover instanceof Blob)||!cover.size)throw Error('素材封面无法读取，请稍后重试或检查同步详情');
  return cover;
}

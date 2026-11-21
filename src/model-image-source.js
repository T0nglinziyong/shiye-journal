// All model requests use an account-scoped cover or a requested COS display
// derivative. Remote originals are never fetched to prepare model input.
export async function loadModelImageSource(asset,{preview,fetchStatic},{edge=512}={}){
  let cover;
  if(asset.blobId){
    try{cover=await preview(asset.blobId,edge);}
    catch(error){if(edge<=480)throw error;}
    if((!(cover instanceof Blob)||!cover.size)&&edge>480)
      cover=await preview(asset.blobId,480);
  }else if(asset.staticPath)cover=await fetchStatic(asset.staticPath);
  if(!(cover instanceof Blob)||!cover.size)throw Error('素材封面无法读取，请稍后重试或检查同步详情');
  return cover;
}

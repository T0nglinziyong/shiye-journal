// Candidate extraction is best-effort per material. An OpenCV box is not a
// visible thumbnail until it has a decoded/encoded image; one malformed alpha
// or failed deskew must not hide every other correctly recognized material.
// A raw fallback is explicitly marked pending review rather than silently
// treating a rectangular crop as a precisely cut sticker.
export async function recoverImportCandidate({
  region,index,extract,rawCrop,makeURL,
  calibrated=false,paperWidthMM=210,paperHeightMM=297,
  onError=console.warn
}={}){
  if(!region||typeof extract!=='function'||typeof rawCrop!=='function'||
      typeof makeURL!=='function')throw Error('候选素材恢复参数不完整');
  try{
    const alpha=region.mask?.alpha;
    if(alpha?.length&&!alpha.some(value=>value>16))
      throw Error('自动轮廓没有可见前景');
    const candidate=await extract(region,index);
    if(!(candidate?.blob instanceof Blob)||!candidate.blob.size||!candidate.url)
      throw Error('识别裁片没有可显示的图像');
    return {candidate,recovered:false,error:null};
  }catch(error){
    onError('候选素材边缘或预览处理失败，尝试保留原始裁片',index+1,error);
    try{
      const raw=await rawCrop(region,index);
      if(!(raw instanceof Blob)||!raw.size)throw Error('原始裁片为空');
      const width=calibrated?Math.round(region.w*paperWidthMM*10)/10:null;
      const height=calibrated?Math.round(region.h*paperHeightMM*10)/10:null;
      return {candidate:{
        blob:raw,originalBlob:raw,candidateFrameBlob:raw,
        url:makeURL(raw),region,title:'素材 '+(index+1),
        width,height,alignment:0,widthRatio:1,heightRatio:1,
        selected:true,reviewStatus:'pendingReview',previewFallback:true,
        processingRecord:{sourceWidthMM:width,sourceHeightMM:height}
      },recovered:true,error};
    }catch(fallbackError){
      onError('原始裁片也无法恢复',index+1,fallbackError);
      return {candidate:null,recovered:false,error:fallbackError};
    }
  }
}

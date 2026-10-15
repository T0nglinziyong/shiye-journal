// A saved editable scene can always generate its own small cover without
// opening the editor or fetching high-resolution material originals.
import {prepareProjectScene} from './scene-v2.js';
export async function renderWorkCoverSnapshot(project,{
  resolveAsset,previewBlob,decodeStatic,renderScene,createBitmap,
  getSnapshot=async()=>null
}={}){
  if(project.isSnapshot)return getSnapshot(project.snapshotBlobId);
  prepareProjectScene(project);
  const draft=project.drafts?.find(d=>d.id===project.activeDraftID)||project.drafts?.[0];
  if(!draft?.canvas?.width||!draft?.canvas?.height)throw Error('作品缺少完整画布，无法生成封面');
  const bitmaps=new Map();
  try{
    const result=await renderScene(draft,{
      scale:480/Math.max(draft.canvas.width,draft.canvas.height),
      waitForFonts:true,
      loadMaterialImage:async id=>{
        if(!bitmaps.has(id))bitmaps.set(id,(async()=>{
          const material=await resolveAsset(id);
          if(!material)throw Error('作品引用的素材不存在：'+id);
          if(material.staticPath)return decodeStatic(material.staticPath);
          if(!material.blobId)throw Error('作品素材缺少可读取图片：'+id);
          const small=await previewBlob(material.blobId,480);
          if(!(small instanceof Blob)||!small.size)throw Error('480px 素材封面尚未同步：'+id);
          return createBitmap(small);
        })());
        return bitmaps.get(id);
      }
    });
    return await new Promise((resolve,reject)=>result.canvas.toBlob(
      blob=>blob?.size?resolve(blob):reject(Error('480px 作品封面编码失败')),'image/webp',.85));
  }finally{
    for(const promise of bitmaps.values())try{(await promise)?.close?.();}catch{}
  }
}

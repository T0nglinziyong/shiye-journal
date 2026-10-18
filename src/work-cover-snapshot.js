// A saved editable scene can always generate its own small cover without
// opening the editor or fetching high-resolution material originals.
import {prepareProjectScene} from './scene-v2.js';
const partialCover=Symbol('partial-work-cover');
export const isPartialWorkCover=blob=>!!blob?.[partialCover];
function missingMaterialImage(){
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#e8ebe5';ctx.fillRect(0,0,160,160);
  ctx.strokeStyle='#9baa9c';ctx.lineWidth=3;ctx.strokeRect(3,3,154,154);
  ctx.fillStyle='#52675a';ctx.font='18px sans-serif';ctx.textAlign='center';
  ctx.fillText('素材缺失',80,85);
  return canvas;
}
export async function renderWorkCoverSnapshot(project,{
  resolveAsset,previewBlob,decodeStatic,renderScene,createBitmap,backgroundYield,
  getSnapshot=async()=>null,createMissingImage=missingMaterialImage
}={}){
  if(project.isSnapshot)return getSnapshot(project.snapshotBlobId);
  prepareProjectScene(project);
  const draft=project.drafts?.find(d=>d.id===project.activeDraftID)||project.drafts?.[0];
  if(!draft?.canvas?.width||!draft?.canvas?.height)throw Error('作品缺少完整画布，无法生成封面');
  const bitmaps=new Map();
  let degraded=false;
  try{
    const result=await renderScene(draft,{
      scale:480/Math.max(draft.canvas.width,draft.canvas.height),
      waitForFonts:true,
      backgroundYield,
      loadMaterialImage:async(id,node)=>{
        const key=node?.sourceBlobId||node?.sourceStaticPath||id;
        if(!bitmaps.has(key))bitmaps.set(key,(async()=>{
          try{
            const material=await resolveAsset(id);
            if(!material&&!node?.sourceBlobId&&!node?.sourceStaticPath)
              throw Error('作品引用的素材不存在：'+id);
            if(node?.sourceStaticPath||material?.staticPath&&!node?.sourceBlobId)
              return decodeStatic(node?.sourceStaticPath||material.staticPath);
            const blobId=node?.sourceBlobId||material?.blobId;
            if(!blobId)throw Error('作品素材缺少可读取图片：'+id);
            const small=await previewBlob(blobId,480);
            if(!(small instanceof Blob)||!small.size)throw Error('480px 素材封面尚未同步：'+id);
            return createBitmap(small);
          }catch{
            // A missing layer image must not blank an otherwise valid cover.
            // Keep the editable Scene unchanged and retry when bytes return.
            degraded=true;return createMissingImage(id);
          }
        })());
        return bitmaps.get(key);
      }
    });
    await backgroundYield?.();
    const blob=await new Promise((resolve,reject)=>result.canvas.toBlob(
      blob=>blob?.size?resolve(blob):reject(Error('480px 作品封面编码失败')),'image/webp',.85));
    if(degraded)Object.defineProperty(blob,partialCover,{value:true});
    return blob;
  }finally{
    for(const promise of bitmaps.values())try{(await promise)?.close?.();}catch{}
  }
}

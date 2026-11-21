import {assetSourceRevision} from './material-anatomy.js';
import {privateCache} from './private-cache.js';
import {offlinePreviewBytes,previewImageFormat} from './offline-preview.js';

// The preview is an AI visual hint, not an editable source image. Keep the
// original immutable in COS and cache only this small, account-scoped derivative.
export const OFFLINE_EXPORT_SOURCE_EDGE=480;
export const OFFLINE_IMPORT_IMAGE_EDGE=1440;
export const OFFLINE_EXPORT_CACHE_VERSION='v3-cover480-webp-png';

const checkCanceled=signal=>{
  if(signal?.aborted)throw signal.reason instanceof Error?signal.reason:Error('已取消导出');
};
export const offlineExportCacheKey=asset=>
  'offline-material:'+OFFLINE_EXPORT_CACHE_VERSION+':'+asset.id+':'+assetSourceRevision(asset);

export async function loadOfflineMaterialCover(asset,edge,{preview,original}){
  let previewError;
  try{
    const cover=await preview(asset.blobId,edge);
    if(cover instanceof Blob&&cover.size)return cover;
  }catch(error){previewError=error;}
  // A fresh import is durable in the local outbox before its cloud thumbnail
  // exists. Decode its stored cutout instead of making export wait for upload.
  const saved=await original(asset.blobId);
  if(saved?.data instanceof Blob&&saved.data.size)return saved.data;
  if(previewError)throw previewError;
  return undefined;
}

// The cutout is already staged on this device when import reports success.
// A cloud thumbnail/metadata row may still be uploading, so export must read
// the durable local bytes before attempting a remote image request.
export async function loadOfflineMaterialOriginal(asset,{readStored,localURL,loadRemote,signal}={}){
  checkCanceled(signal);
  if(!asset?.blobId)throw Error('素材缺少原图标识');
  let firstError;
  try{
    const row=await readStored(asset.blobId);
    if(row?.data instanceof Blob&&row.data.size)return row.data;
  }catch(error){firstError=error;}
  checkCanceled(signal);
  const url=localURL?.(asset.blobId);
  if(url){
    try{const response=await fetch(url,{signal});if(response.ok){const blob=await response.blob();if(blob.size)return blob;}}
    catch(error){if(signal?.aborted)throw error;firstError||=error;}
  }
  checkCanceled(signal);
  if(loadRemote){
    try{const blob=await loadRemote(asset.blobId);if(blob instanceof Blob&&blob.size)return blob;}
    catch(error){firstError||=error;}
  }
  throw Error('素材「'+asset.title+'」的原图不可用；本机导入或云端上传尚未完成'+(firstError?.message?'：'+firstError.message:''));
}

export async function mapOfflineExportLimited(entries,limit,task,{signal,onDone=()=>{}}={}){
  if(!Number.isInteger(limit)||limit<1)throw Error('并发上限无效');
  const output=new Array(entries.length);
  let next=0,completed=0;
  await Promise.all(Array.from({length:Math.min(limit,entries.length)},async()=>{
    while(next<entries.length){
      checkCanceled(signal);
      const index=next++;
      output[index]=await task(entries[index],index);
      checkCanceled(signal);
      onDone(++completed,entries.length,index);
    }
  }));
  return output;
}

export async function prepareOfflineMaterialPreview({
  asset,account,loadVariant,cache=privateCache,
  encode=offlinePreviewBytes,signal
}){
  checkCanceled(signal);
  if(!asset?.id||!account)throw Error('素材预览缺少账户或素材身份');
  const key=offlineExportCacheKey(asset);
  // Malformed cached bytes never enter an AI task ZIP.
  try{
    const stored=await cache.get(account,key);
    if(stored instanceof Blob&&stored.size){
      const bytes=new Uint8Array(await stored.arrayBuffer());
      if(['webp','png'].includes(previewImageFormat(bytes)?.extension)){
        checkCanceled(signal);
        return {bytes,cacheHit:true,source:'cache'};
      }
    }
  }catch{/* A disposable cache must never prevent an export. */}
  checkCanceled(signal);
  if(typeof loadVariant!=='function')throw Error('素材封面读取方式不可用');
  const preview=await loadVariant(asset,OFFLINE_EXPORT_SOURCE_EDGE);
  if(!(preview instanceof Blob)||!preview.size)throw Error('素材「'+asset.title+'」的封面不可用，请检查同步状态后重试');
  checkCanceled(signal);
  const bytes=await encode(preview,{maxEdge:OFFLINE_EXPORT_SOURCE_EDGE});
  checkCanceled(signal);
  if(!['webp','png'].includes(previewImageFormat(bytes)?.extension))throw Error('无法生成保留透明通道的素材预览');
  try{await cache.put(account,key,new Blob([bytes],{type:previewImageFormat(bytes).mimeType}));}
  catch{/* Account-scoped cache may be unavailable or full. */}
  checkCanceled(signal);
  return {bytes,cacheHit:false,source:'cover'};
}

// Only after the package has been delivered: warm the display-sized COS
// derivative in the existing priority queue. A single background lane leaves
// visible cards and details free to use the remaining network slots.
export async function prefetchOfflineImportImages(assets,{loadVariant,isCurrent=()=>true,onError=()=>{}}={}){
  const ids=[...new Set(assets.filter(asset=>asset?.blobId&&!asset.staticPath).map(asset=>asset.blobId))];
  for(const id of ids){
    if(!isCurrent())break;
    try{await loadVariant(id,OFFLINE_IMPORT_IMAGE_EDGE);}
    catch(error){onError(error,id);}
  }
}

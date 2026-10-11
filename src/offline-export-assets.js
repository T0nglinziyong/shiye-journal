import {assetSourceRevision} from './material-anatomy.js';
import {privateCache} from './private-cache.js';
import {offlinePreviewBytes,previewImageFormat} from './offline-preview.js';

// The preview is an AI visual hint, not an editable source image. Keep the
// original immutable in COS and cache only this small, account-scoped derivative.
export const OFFLINE_EXPORT_SOURCE_EDGE=600;
export const OFFLINE_EXPORT_CACHE_VERSION='v2-600-512-webp-png';

const checkCanceled=signal=>{
  if(signal?.aborted)throw signal.reason instanceof Error?signal.reason:Error('已取消导出');
};
export const offlineExportCacheKey=asset=>
  'offline-material:'+OFFLINE_EXPORT_CACHE_VERSION+':'+asset.id+':'+assetSourceRevision(asset);

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
  asset,account,loadVariant,loadOriginal,cache=privateCache,
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
  let bytes,source='variant';
  try{
    if(asset.staticPath||typeof loadVariant!=='function')throw Error('使用静态素材原图');
    const preview=await loadVariant(asset,OFFLINE_EXPORT_SOURCE_EDGE);
    if(!(preview instanceof Blob)||!preview.size)throw Error('COS 图片派生预览为空');
    checkCanceled(signal);
    bytes=await encode(preview);
    if(!['webp','png'].includes(previewImageFormat(bytes)?.extension))throw Error('图片派生格式不支持透明素材');
  }catch(error){
    checkCanceled(signal);
    // Preserve existing behaviour if COS transformation or WebP decoding is
    // unavailable; do not silently omit an image or break a ZIP export.
    const original=await loadOriginal(asset);
    if(!(original instanceof Blob)||!original.size)throw Error('素材「'+asset.title+'」缺少图片');
    checkCanceled(signal);
    bytes=await encode(original);
    source='original';
  }
  checkCanceled(signal);
  if(!['webp','png'].includes(previewImageFormat(bytes)?.extension))throw Error('无法生成保留透明通道的素材预览');
  try{await cache.put(account,key,new Blob([bytes],{type:previewImageFormat(bytes).mimeType}));}
  catch{/* Account-scoped cache may be unavailable or full. */}
  checkCanceled(signal);
  return {bytes,cacheHit:false,source};
}

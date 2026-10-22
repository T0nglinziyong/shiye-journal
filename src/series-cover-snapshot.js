import {drawSeriesCover,SERIES_COVER_WIDTH,SERIES_COVER_HEIGHT,SERIES_COVER_VERSION,resolvedSeriesCoverLayout} from './series-cover-layout.js';
import {tapeFlatCanvas} from './tape-flat-crop.js';
import {privateCache} from './private-cache.js';
import {seriesCovers} from './library-model.js';

const live=new Map();
let scope;
function accountScope(account){
  if(scope===account)return;
  for(const url of live.values())URL.revokeObjectURL(url);
  live.clear();scope=account;
}
export function seriesCoverSignature(series,assets){
  return JSON.stringify([SERIES_COVER_VERSION,resolvedSeriesCoverLayout(series.coverLayout),SERIES_COVER_WIDTH,SERIES_COVER_HEIGHT,seriesCovers(series,assets).map(a=>[a.id,a.blobId,a.staticPath||'',a.updatedAt||'',a.kind,a.tapeAxis,a.physicalWidthMM,a.physicalHeightMM,a.tapeFlatCrop])]);
}
export function waitForCoverImage(img){
  const ready=()=>img.isConnected&&!img.src.includes('#shiye-image=')&&img.complete&&img.naturalWidth>1;
  if(ready())return Promise.resolve(img);
  return new Promise(resolve=>{
    const finish=()=>{observer.disconnect();clearTimeout(timeout);img.removeEventListener('load',check);img.removeEventListener('error',fail);resolve(ready()?img:null);};
    const check=()=>{if(ready())finish();};
    const fail=()=>finish();
    const observer=new MutationObserver(check),timeout=setTimeout(finish,30000);
    observer.observe(img,{attributes:true,attributeFilter:['src']});
    img.addEventListener('load',check);img.addEventListener('error',fail);check();
  });
}
async function drawCover(images,series,members){
 const canvas=document.createElement('canvas');canvas.width=SERIES_COVER_WIDTH;canvas.height=SERIES_COVER_HEIGHT;
 const ctx=canvas.getContext('2d');if(!ctx)return null;
 const sources=images.map((image,index)=>{
  const asset=members[index];if(asset.kind!=='tape')return image;
  const axis=asset.tapeAxis==='y'?'y':asset.tapeAxis==='x'?'x':Number(asset.physicalWidthMM)>=Number(asset.physicalHeightMM)?'x':'y';
  // Cache exactly the flattened tape presentation, never its hidden raw PNG.
  const flat=tapeFlatCanvas(image,axis,asset.tapeFlatCrop,{maxSize:480});
  if(!flat)throw Error('胶带封面尚未就绪');return flat.canvas;
 });
 drawSeriesCover(ctx,sources,series.coverLayout);
 return new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.88));
}
export async function loadSeriesCoverSnapshot({cover,series,assets,account='browser',cache=privateCache}){
  if(!cover||!series)return null;
  accountScope(account);
  const key=JSON.stringify([account,series.id,seriesCoverSignature(series,assets)]);
  let url=live.get(key);
  if(url)return url;
  const saved=await cache.get('series-cover:'+account,key).catch(()=>null);
  if(saved instanceof Blob&&saved.size){
    if(scope!==account)return null;
    url=URL.createObjectURL(saved);live.set(key,url);return url;
  }
  const members=seriesCovers(series,assets);
  const images=members.map(asset=>[...cover.querySelectorAll('[data-series-cover-item] img[data-asset-image-id]')].find(img=>img.dataset.assetImageId===asset.id));
  if(!images.length||images.some(img=>!img))return null;
  const ready=await Promise.all(images.map(waitForCoverImage));
  if(!cover.isConnected||ready.some(img=>!img)||scope!==account)return null;
  const blob=await drawCover(ready,series,members);
  if(!(blob instanceof Blob)||!blob.size)return null;
  await cache.put('series-cover:'+account,key,blob).catch(()=>{});
  if(scope!==account)return null;
  url=URL.createObjectURL(blob);live.set(key,url);return url;
}

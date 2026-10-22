import {SERIES_COVER_VERSION,SERIES_COVER_SIZE,seriesCoverLayout,paintSeriesCover} from './series-cover-layout.js';
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
  return JSON.stringify([SERIES_COVER_VERSION,series.coverLayout||'auto',seriesCovers(series,assets).map(a=>[a.id,a.blobId,a.staticPath,a.updatedAt||'',a.kind,a.tapeAxis,a.tapeFlatCrop,a.physicalWidthMM,a.physicalHeightMM])]);
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
async function drawCover(images,series,assets){
  const {width,height}=SERIES_COVER_SIZE,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  const members=seriesCovers(series,assets);
  const views=images.map((img,i)=>{const asset=members[i];if(asset?.kind!=='tape')return img;
    const axis=asset.tapeAxis||(asset.physicalWidthMM>=asset.physicalHeightMM?'x':'y');return tapeFlatCanvas(img,axis,asset.tapeFlatCrop,{maxSize:360})?.canvas||img;});
  paintSeriesCover(ctx,views,seriesCoverLayout(views.length,series.coverLayout),{width,height});
  return new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));
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
  const images=[...cover.querySelectorAll('img:not(.series-cover-snapshot)')];
  if(!images.length)return null;
  const ready=await Promise.all(images.map(waitForCoverImage));
  if(!cover.isConnected||ready.some(img=>!img)||scope!==account)return null;
  const blob=await drawCover(ready,series,assets);
  if(!(blob instanceof Blob)||!blob.size)return null;
  await cache.put('series-cover:'+account,key,blob).catch(()=>{});
  if(scope!==account)return null;
  url=URL.createObjectURL(blob);live.set(key,url);return url;
}

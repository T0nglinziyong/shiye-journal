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
  return JSON.stringify([480,seriesCovers(series,assets).map(a=>[a.id,a.blobId,a.updatedAt||''])]);
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
async function drawCover(images){
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=400;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.fillStyle='#fffefa';ctx.fillRect(0,0,480,400);
  const slot=480/images.length;
  images.forEach((img,index)=>{
    const scale=Math.min((slot-16)/img.naturalWidth,280/img.naturalHeight);
    const width=img.naturalWidth*scale,height=img.naturalHeight*scale;
    ctx.drawImage(img,index*slot+(slot-width)/2,(400-height)/2,width,height);
  });
  return new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));
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
  const blob=await drawCover(ready);
  if(!(blob instanceof Blob)||!blob.size)return null;
  await cache.put('series-cover:'+account,key,blob).catch(()=>{});
  if(scope!==account)return null;
  url=URL.createObjectURL(blob);live.set(key,url);return url;
}

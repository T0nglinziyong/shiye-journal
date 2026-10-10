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
function showSnapshot(cover,url,priority){
  if(!cover.isConnected)return;
  const img=document.createElement('img');img.className='series-cover-snapshot';img.src=url;
  img.alt='';img.loading=priority?'eager':'lazy';img.decoding='async';
  cover.replaceChildren(img);
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
export function mountSeriesCoverSnapshots({view,state,cache=privateCache}){
  if(state.route!=='series')return;
  const account=state.accountId||'browser';accountScope(account);
  for(const [index,card] of [...view.querySelectorAll('[data-act="series-detail"]')].entries()){
    const series=state.series.find(s=>s.id===card.dataset.id),cover=card.querySelector('.series-cover');
    if(!series||!cover)continue;
    const signature=seriesCoverSignature(series,state.assets),key=JSON.stringify([account,series.id,signature]);
    if(cover.querySelector('.series-cover-snapshot')&&cover.dataset.snapshotKey===key)continue;
    cover.dataset.snapshotKey=key;
    void (async()=>{
      let url=live.get(key);
      if(!url){
        const saved=await cache.get('series-cover:'+account,key).catch(()=>null);
        if(saved instanceof Blob&&saved.size){url=URL.createObjectURL(saved);live.set(key,url);}
      }
      if(url){if(cover.dataset.snapshotKey===key)showSnapshot(cover,url,index<2);return;}
      const images=[...cover.querySelectorAll('img')];if(!images.length)return;
      const ready=await Promise.all(images.map(waitForCoverImage));
      if(!cover.isConnected||cover.dataset.snapshotKey!==key||ready.some(img=>!img))return;
      try{
        const blob=await drawCover(ready);if(!(blob instanceof Blob)||!blob.size)return;
        await cache.put('series-cover:'+account,key,blob).catch(()=>{});
        if(cover.dataset.snapshotKey!==key||scope!==account)return;
        url=URL.createObjectURL(blob);live.set(key,url);showSnapshot(cover,url,index<2);
      }catch{/* A failed presentation snapshot leaves the regular cover intact. */}
    })();
  }
}

import {bindImageResources,cachedImageSource,notifyImageInvalidation} from './presentation-resources.js';
import {imagePixelSize,MIN_DISPLAY_EDGE,MAX_DISPLAY_EDGE} from './image-variants.js';
const EMPTY='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
const placeholder=id=>id?EMPTY+'#shiye-image='+encodeURIComponent(id):'';
export const imagePlaceholder=id=>id?(cachedImageSource(id)||placeholder(id)):'';
export function mountPrivateImages({root,db,urls,fullView=()=>false,onError=console.warn}){
  const pending=new Map(),previews=new Map(),variants=new Map(),sizes=new Map(),previewSizes=new Map(),variantSizes=new Map(),retained=new Map(),queue=[],versions=new Map(),retryTimers=new Map(),retryCounts=new Map(),resizeTimers=new Map(),brokenPreviews=new Set(),observed=new WeakSet();
  let active=0,generation=0,disposed=false,trimTimer=null;
  const concurrency=globalThis.matchMedia?.('(pointer: coarse)').matches?4:7;
  const version=id=>versions.get(id)||0;
  const touch=(map,id)=>{if(map.has(id)){const v=map.get(id);map.delete(id);map.set(id,v);}};
  const bestVariant=id=>{let chosen=null;for(const [key,row] of variants)if(row.id===id&&(!chosen||row.tier>chosen.tier))chosen=row;return chosen;};
  const currentSource=id=>{touch(sizes,id);touch(previewSizes,id);const best=bestVariant(id);if(best)touch(variantSizes,id+':'+best.tier);return urls.get(id)||best?.url||previews.get(id)||'';};
  const identity=source=>{
    for(const [id,url] of urls)if(url===source)return {id,version:version(id),full:true};
    for(const [id,url] of previews)if(url===source)return {id,version:version(id),full:false};
    for(const row of variants.values())if(row.url===source)return {id:row.id,version:version(row.id),full:false,tier:row.tier};
    return null;
  };
  const unbind=bindImageResources({source:currentSource,identity});
  const displayTier=img=>{const rect=img.getBoundingClientRect(),pixels=rect.width>0&&rect.height>0?Math.max(rect.width,rect.height):Math.max(img.clientWidth||0,img.clientHeight||0);return imagePixelSize(pixels||400,globalThis.devicePixelRatio||1,globalThis.screen?.width||1440,globalThis.screen?.height||900);};
  function scheduleUpgrade(img){
    if(disposed||!fullView(img))return;
    clearTimeout(resizeTimers.get(img));
    resizeTimers.set(img,setTimeout(()=>{
      resizeTimers.delete(img);if(!img.isConnected||img.dataset.imageError||img.dataset.privateImageLoading||!onScreen(img)&&observer)return;
      const known=identity(img.getAttribute('src')||'');
      if(known&&!known.full&&displayTier(img)>(known.tier||360))resolve(img,known.id);
    },180));
  }
  function scheduleRetry(id){if(disposed||retryTimers.has(id))return;const count=Math.min((retryCounts.get(id)||0)+1,6);retryCounts.set(id,count);retryTimers.set(id,setTimeout(()=>{retryTimers.delete(id);retryMissing(id);},Math.min(30000,1000*2**(count-1))));}
  function retryMissing(id){if(disposed)return;for(const img of root.querySelectorAll('img[data-image-error="true"]')){if(id&&img.dataset.privateImageId!==id)continue;delete img.dataset.imageError;if(onScreen(img)||!observer)resolve(img,img.dataset.privateImageId);else observer.observe(img);}}
  function releaseURL(map,accounting,id){const url=map.get(id);if(!url)return;notifyImageInvalidation([id]);map.delete(id);accounting.delete(id);URL.revokeObjectURL(url);}
  function trim(){
    trimTimer=null;if(disposed)return;
    const live=new Set([...root.querySelectorAll('img')].map(im=>im.getAttribute('src')));
    for(const [map,accounting,maxBytes,maxCount] of [[urls,sizes,96*1024*1024,96],[previews,previewSizes,24*1024*1024,240]]){
      let bytes=[...accounting.values()].reduce((a,b)=>a+b,0);
      for(const [id,size] of accounting){
        if(bytes<=maxBytes&&accounting.size<=maxCount)break;
        if(live.has(map.get(id))||retained.has(id))continue;
        releaseURL(map,accounting,id);bytes-=size;
      }
    }
    let bytes=[...variantSizes.values()].reduce((a,b)=>a+b,0);
    for(const [key,size] of variantSizes){
      if(bytes<=48*1024*1024&&variantSizes.size<=96)break;
      const row=variants.get(key);if(!row||live.has(row.url)||retained.has(row.id))continue;
      variants.delete(key);variantSizes.delete(key);notifyImageInvalidation([row.id]);URL.revokeObjectURL(row.url);bytes-=size;
    }
  }
  const queueTrim=()=>{if(trimTimer===null&&!disposed)trimTimer=setTimeout(trim,0);};
  async function load(id,requested=false){
    if(disposed)return '';
    // Requested display pixels have already been calculated using DPR and screen
    // size by displayTier(). Running imagePixelSize() a second time would
    // multiply them again and fetch unnecessarily large COS variants.
    const full=requested===true,tier=full?0:requested===false?MIN_DISPLAY_EDGE:
      Math.max(MIN_DISPLAY_EDGE,Math.min(MAX_DISPLAY_EDGE,Math.ceil(Number(requested)||MIN_DISPLAY_EDGE)));
    if(urls.has(id)){touch(sizes,id);return urls.get(id);}
    if(!full){
      if(tier===360&&previews.has(id)){touch(previewSizes,id);return previews.get(id);}
      const available=[...variants.values()].filter(row=>row.id===id&&row.tier>=tier).sort((a,b)=>a.tier-b.tier)[0];
      if(available){touch(variantSizes,id+':'+available.tier);return available.url;}
    }
    const key=(full?'original:':tier+':')+id;if(pending.has(key))return pending.get(key);
    const epoch=generation,itemVersion=version(id);
    const task=new Promise((resolve,reject)=>{queue.push({id,tier,run:async()=>{
      if(disposed||epoch!==generation||itemVersion!==version(id))return '';
      const blob=full?(await db.get('blobs',id))?.data:await db.previewBlob(id,tier);
      if(disposed||epoch!==generation||itemVersion!==version(id))return '';
      if(!blob)throw Error('图片尚未同步到可读取位置');
      if(urls.has(id))return urls.get(id);
      const url=URL.createObjectURL(blob);
      if(full){urls.set(id,url);sizes.set(id,blob.size);}
      else if(tier===360){previews.set(id,url);previewSizes.set(id,blob.size);}
      else{variants.set(key,{id,tier,url});variantSizes.set(id+':'+tier,blob.size);}
      queueTrim();return url;
    },resolve,reject});pump();});
    pending.set(key,task);task.finally(()=>{if(pending.get(key)===task)pending.delete(key);}).catch(()=>{});return task;
  }
  // Scrolling users care about the items at their *new* stopping position.
  // Re-rank waiting jobs at dispatch time, rather than letting previously
  // approached rows monopolize every available COS download slot.
  function queueRank(id){
    let best=1e9;
    for(const img of root.querySelectorAll('img[data-private-image-id]')){
      if(img.dataset.privateImageId!==id||!img.isConnected)continue;
      const rect=img.getBoundingClientRect();
      if(rect.width<=0||rect.height<=0)continue;
      const vertical=Math.max(0,rect.top-innerHeight,-rect.bottom),
        horizontal=Math.max(0,rect.left-innerWidth,-rect.right);
      best=Math.min(best,vertical+horizontal);
      if(best===0)break;
    }
    return best;
  }
  function pump(){while(!disposed&&active<concurrency&&queue.length){
    if(queue.length>1){let best=0,rank=queueRank(queue[0].id);
      for(let i=1;i<queue.length;i++){const next=queueRank(queue[i].id);
        if(next<rank){rank=next;best=i;if(rank===0)break;}}
      if(best)queue.unshift(queue.splice(best,1)[0]);
    }
    const job=queue.shift();active++;job.run().then(job.resolve,job.reject).finally(()=>{active--;pump();});
  }}

  function resolve(img,knownID){
    const src=img.getAttribute('src')||'',at=src.indexOf('#shiye-image='),known=identity(src);
    let id=knownID||known?.id;if(!id&&at>=0){try{id=decodeURIComponent(src.slice(at+13));}catch{return;}}
    if(!id||img.dataset.privateImageLoading||disposed)return;
    const epoch=generation,itemVersion=version(id),stamp=epoch+':'+itemVersion;
    img.dataset.privateImageId=id;img.dataset.privateImageLoading=stamp;
    const current=()=>!disposed&&epoch===generation&&itemVersion===version(id);
    const target=fullView(img)?displayTier(img):360;
    const full=brokenPreviews.has(id);
    void(async()=>{
      let shown=src;
      if(target>360&&!full)try{const preview=await load(id,false);if(!current())return;if(preview&&img.isConnected&&img.getAttribute('src')===src){img.src=preview;shown=preview;}}catch(error){if(current())onError(error);}
      const url=await load(id,full?true:target);if(!current())return;
      if(url&&img.isConnected&&img.getAttribute('src')===shown){if(img.getAttribute('src')!==url)img.src=url;delete img.dataset.imageError;retryCounts.delete(id);const timer=retryTimers.get(id);if(timer){clearTimeout(timer);retryTimers.delete(id);}}
      else if(!url&&img.isConnected){img.dataset.imageError='true';scheduleRetry(id);}
    })().catch(error=>{if(current()&&img.isConnected){img.dataset.imageError='true';img.src=placeholder(id);scheduleRetry(id);onError(error);}}).finally(()=>{if(img.dataset.privateImageLoading===stamp){delete img.dataset.privateImageLoading;scheduleUpgrade(img);}});
  }
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);resolve(e.target,e.target.dataset.privateImageId);}},{rootMargin:'850px'}):null;
  const sizingObserver=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{for(const {target:img} of entries)scheduleUpgrade(img);}):null;
  const onViewportResize=()=>{for(const img of root.querySelectorAll('img[data-private-image-id]'))scheduleUpgrade(img);};
  globalThis.addEventListener?.('resize',onViewportResize);
  function onScreen(img){const box=img.getBoundingClientRect();return box.width>0&&box.height>0&&box.bottom>=-850&&box.top<=innerHeight+850&&box.right>=-850&&box.left<=innerWidth+850;}
  function scan(node){if(disposed||node.nodeType!==1)return;const images=node.matches('img')?[node]:node.querySelectorAll('img');for(const img of images){
    if(!observed.has(img)){observed.add(img);sizingObserver?.observe(img);img.addEventListener('error',()=>{
      const id=img.dataset.privateImageId,src=img.getAttribute('src');if(!id||!src?.startsWith('blob:'))return;
      const derived=identity(src);
      if(derived&&!derived.full){
        brokenPreviews.add(id);
        if(derived.tier){const key=id+':'+derived.tier;variants.delete(derived.tier+':'+id);variantSizes.delete(key);URL.revokeObjectURL(src);notifyImageInvalidation([id]);}
        else releaseURL(previews,previewSizes,id);
        delete img.dataset.privateImageLoading;img.src=placeholder(id);resolve(img,id);return;
      }
      if(src===urls.get(id))releaseURL(urls,sizes,id);
      img.dataset.imageError='true';img.src=placeholder(id);scheduleRetry(id);
    });}
    const src=img.getAttribute('src')||'',known=identity(src);
    if(known)img.dataset.privateImageId=known.id;
    // Warm list thumbnails need no async pass. Editor entry upgrades them.
    const desired=fullView(img)?displayTier(img):360;
    if(src.includes('#shiye-image=')){if(onScreen(img)||!observer)resolve(img,known?.id);else observer.observe(img);}
    else if(known&&!known.full&&desired>(known.tier||360))scheduleUpgrade(img);
  }}
  const changes=new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')scan(r.target);else for(const node of r.addedNodes)scan(node);}});
  changes.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['src','style','class']});scan(root);
  return {load,retain(ids){for(const id of ids)retained.set(id,(retained.get(id)||0)+1);let released=false;return()=>{if(released)return;released=true;for(const id of ids){const n=retained.get(id)||0;if(n>1)retained.set(id,n-1);else retained.delete(id);}trim();};},retryMissing(){retryMissing();},
    stats:()=>({originals:sizes.size,previews:previewSizes.size,displayVariants:variantSizes.size,originalBytes:[...sizes.values()].reduce((a,b)=>a+b,0),previewBytes:[...previewSizes.values()].reduce((a,b)=>a+b,0),pending:pending.size}),
    invalidate(ids){
      if(ids&&!ids.length)return;const affected=ids?new Set(ids):null;if(!affected){generation++;pending.clear();}notifyImageInvalidation(affected);
      for(const id of affected||new Set([...urls.keys(),...previews.keys(),...[...variants.values()].map(row=>row.id),...root.querySelectorAll('img[data-private-image-id]')].map(img=>typeof img==='string'?img:img.dataset.privateImageId))){versions.set(id,version(id)+1);for(const key of pending.keys())if(key.endsWith(':'+id))pending.delete(key);const timer=retryTimers.get(id);if(timer)clearTimeout(timer);retryTimers.delete(id);retryCounts.delete(id);brokenPreviews.delete(id);}
      for(const [map,accounting] of [[urls,sizes],[previews,previewSizes]])for(const [id,url] of map){if(affected&&!affected.has(id))continue;map.delete(id);accounting.delete(id);URL.revokeObjectURL(url);}
      for(const [key,row] of variants){if(affected&&!affected.has(row.id))continue;variants.delete(key);variantSizes.delete(row.id+':'+row.tier);URL.revokeObjectURL(row.url);}
      for(const img of root.querySelectorAll('img[data-private-image-id]')){const id=img.dataset.privateImageId;if(affected&&!affected.has(id))continue;delete img.dataset.privateImageLoading;delete img.dataset.imageError;img.src=placeholder(id);if(onScreen(img)||!observer)resolve(img,id);else observer.observe(img);}scan(root);
    },
    dispose(){disposed=true;generation++;unbind();changes.disconnect();observer?.disconnect();sizingObserver?.disconnect();globalThis.removeEventListener?.('resize',onViewportResize);if(trimTimer!==null)clearTimeout(trimTimer);for(const timer of retryTimers.values())clearTimeout(timer);retryTimers.clear();for(const timer of resizeTimers.values())clearTimeout(timer);resizeTimers.clear();for(const job of queue.splice(0))job.resolve('');pending.clear();for(const map of [urls,previews]){for(const url of map.values())URL.revokeObjectURL(url);map.clear();}for(const row of variants.values())URL.revokeObjectURL(row.url);variants.clear();sizes.clear();previewSizes.clear();variantSizes.clear();retained.clear();}
  };
}

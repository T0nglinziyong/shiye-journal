import {bindImageResources,cachedImageSource,notifyImageInvalidation} from './presentation-resources.js';
import {imagePixelSize,imageTier,cachedTierChoice,COVER_EDGE,MIN_DISPLAY_EDGE,MAX_DISPLAY_EDGE} from './image-variants.js';
const EMPTY='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
const placeholder=id=>id?EMPTY+'#shiye-image='+encodeURIComponent(id):'';
export const imagePlaceholder=id=>id?(cachedImageSource(id)||placeholder(id)):'';
export function mountPrivateImages({root,db,urls,fullView=()=>false,onError=console.warn,onEvent=()=>{}}){
  const pending=new Map(),jobs=new Map(),previews=new Map(),variants=new Map(),sizes=new Map(),previewSizes=new Map(),variantSizes=new Map(),retained=new Map(),queue=[],versions=new Map(),retryTimers=new Map(),retryCounts=new Map(),resizeTimers=new Map(),brokenPreviews=new Set(),observed=new WeakSet(),activeIDs=new Map();
  let active=0,focusedActive=0,scrollActive=0,generation=0,disposed=false,trimTimer=null,focusedID=null;
  const emit=event=>{try{onEvent(event);}catch{/* Diagnostics never block image loading. */}};
  // Network bound COS thumbnail reads; browser decoding remains lazy.
  const tablet=globalThis.matchMedia?.('(pointer: coarse) and (min-width: 700px)').matches;
  const concurrency=tablet?2:globalThis.matchMedia?.('(pointer: coarse)').matches?3:6;
  const budget=tablet?0.5:1;
  const version=id=>versions.get(id)||0;
  const touch=(map,id)=>{if(map.has(id)){const v=map.get(id);map.delete(id);map.set(id,v);}};
  // Reuse existing higher-tier decoded bytes, including on list cards. Never
  // request a 480px cover just because a 960px image is already in memory.
  const cachedEntries=id=>[
    ...(previews.has(id)?[{tier:COVER_EDGE,url:previews.get(id),type:'cover'}]:[]),
    ...[...variants.values()].filter(row=>row.id===id).map(row=>({...row,type:'variant'}))
  ];
  const cachedChoice=(id,target)=>{
    const entries=cachedEntries(id),choice=cachedTierChoice(entries.map(row=>row.tier),target);
    const tier=choice.sufficient??choice.temporary;
    const row=entries.find(entry=>entry.tier===tier);
    if(row?.type==='cover')touch(previewSizes,id);
    if(row?.type==='variant')touch(variantSizes,id+':'+row.tier);
    return row?{...row,sufficient:choice.sufficient!==null}:null;
  };
  const currentSource=id=>cachedChoice(id,COVER_EDGE)?.url||'';
  const identity=source=>{
    for(const [id,url] of urls)if(url===source)return {id,version:version(id),full:true};
    for(const [id,url] of previews)if(url===source)return {id,version:version(id),full:false,tier:COVER_EDGE};
    for(const row of variants.values())if(row.url===source)return {id:row.id,version:version(row.id),full:false,tier:row.tier};
    return null;
  };
  const unbind=bindImageResources({source:currentSource,identity});
  const displayTier=img=>{
    // Detail/inspection show one centered asset at a comparable fraction of
    // the screen, independent of the physical size of that particular asset.
    // The creative canvas instead uses the rendered material rectangle:
    // different real-world sizes legitimately demand different pixel counts.
    const detail=!!img.closest('.detail-picture,.cutout-preview');
    const rect=(img.closest('#canvas-page .canvas-object.material')||img).getBoundingClientRect();
    const screenWidth=globalThis.innerWidth||globalThis.screen?.width||1440;
    const screenHeight=globalThis.innerHeight||globalThis.screen?.height||900;
    const pixels=detail
      ? Math.min(screenWidth,screenHeight)*.72
      : rect.width>0&&rect.height>0?Math.max(rect.width,rect.height):Math.max(img.clientWidth||0,img.clientHeight||0);
    // Double request pixels for detail and actual canvas material rectangles only.
    // Catalogue, matching and work cards keep their unchanged 480px tier.
    const highDetail=!!img.closest('.detail-picture,#canvas-page .canvas-object.material');
    const selected=imagePixelSize((pixels||400)*(highDetail?2:1),globalThis.devicePixelRatio||1,screenWidth,screenHeight);
    return img.closest('.cutout-preview')?Math.max(960,selected):selected;
  };
  function scheduleUpgrade(img){
    if(disposed||!img.isConnected||img.dataset.privateImageLoading)return;
    const existing=identity(img.getAttribute('src')||'');
    const target=fullView(img)?displayTier(img):COVER_EDGE;
    if(!existing||existing.full||target<=(existing.tier||COVER_EDGE))return;
    clearTimeout(resizeTimers.get(img));
    resizeTimers.set(img,setTimeout(()=>{
      resizeTimers.delete(img);if(!img.isConnected||img.dataset.imageError||img.dataset.privateImageLoading||!onScreen(img)&&observer)return;
      const known=identity(img.getAttribute('src')||'');
      if(known&&!known.full&&(fullView(img)?displayTier(img):COVER_EDGE)>(known.tier||COVER_EDGE))resolve(img,known.id);
    },180));
  }
  function scheduleRetry(id){if(disposed||retryTimers.has(id))return;const count=Math.min((retryCounts.get(id)||0)+1,6);retryCounts.set(id,count);retryTimers.set(id,setTimeout(()=>{retryTimers.delete(id);retryMissing(id);},Math.min(30000,1000*2**(count-1))));}
  function retryMissing(id){if(disposed)return;for(const img of root.querySelectorAll('img[data-image-error="true"]')){if(id&&img.dataset.privateImageId!==id)continue;delete img.dataset.imageError;if(onScreen(img)||!observer)resolve(img,img.dataset.privateImageId);else observer.observe(img);}}
  function releaseURL(map,accounting,id){const url=map.get(id);if(!url)return;notifyImageInvalidation([id]);map.delete(id);accounting.delete(id);URL.revokeObjectURL(url);}
  function trim(){
    trimTimer=null;if(disposed)return;
    const live=new Set([...root.querySelectorAll('img')].map(im=>im.getAttribute('src')));
    for(const [map,accounting,maxBytes,maxCount] of [[urls,sizes,96*1024*1024*budget,96*budget],[previews,previewSizes,48*1024*1024*budget,480*budget]]){
      let bytes=[...accounting.values()].reduce((a,b)=>a+b,0);
      for(const [id,size] of accounting){
        if(bytes<=maxBytes&&accounting.size<=maxCount)break;
        if(live.has(map.get(id))||retained.has(id))continue;
        releaseURL(map,accounting,id);bytes-=size;
      }
    }
    let bytes=[...variantSizes.values()].reduce((a,b)=>a+b,0);
    for(const [key,size] of variantSizes){
      if(bytes<=64*1024*1024*budget&&variantSizes.size<=128*budget)break;
      const row=variants.get(key);if(!row||live.has(row.url)||retained.has(row.id))continue;
      variants.delete(key);variantSizes.delete(key);notifyImageInvalidation([row.id]);URL.revokeObjectURL(row.url);bytes-=size;
    }
  }
  const queueTrim=()=>{if(trimTimer===null&&!disposed)trimTimer=setTimeout(trim,0);};
  async function load(id,requested=false,{background=false,ephemeral=false,allowRemoteOriginal=true}={}){
    if(disposed)return '';
    // Requested display pixels have already been calculated using DPR and screen
    // size by displayTier(). Running imagePixelSize() a second time would
    // multiply them again and fetch unnecessarily large COS variants.
    const full=requested===true,tier=full?0:requested===false?COVER_EDGE:
      imageTier(requested);
    const imageTierName=full?'original':tier===COVER_EDGE?'cover':'display';
    const context=()=>focusedID===id?'detail':background?'background':'visible';
    if(full&&urls.has(id)){touch(sizes,id);emit({phase:'loaded',tier:imageTierName,context:context(),source:'memory',durationMs:0});return urls.get(id);}
    if(!full){
      const cached=cachedChoice(id,tier);
      // A larger decoded variant can paint immediately, but catalogue cards
      // still acquire their compact 480px derivative from the local cache.
      if(cached?.sufficient&&(tier!==COVER_EDGE||cached.tier===COVER_EDGE)){
        emit({phase:'loaded',tier:imageTierName,context:context(),source:'memory',durationMs:0});return cached.url;
      }
    }
    const key=(full?'original:':tier+':')+id;
    if(pending.has(key)){
      if(!ephemeral&&jobs.has(key))jobs.get(key).ephemeral=false;
      return pending.get(key);
    }
    const epoch=generation,itemVersion=version(id),queuedAt=Date.now();
    emit({phase:'queued',tier:imageTierName,context:context(),source:'store'});
    let job;
    const task=new Promise((resolve,reject)=>{job={key,id,tier,ephemeral,run:async()=>{
      if(disposed||epoch!==generation||itemVersion!==version(id))return '';
      const waitMs=Date.now()-queuedAt,started=Date.now();
      emit({phase:'started',tier:imageTierName,context:context(),source:'store',waitMs});
      let blob;
      try{blob=full?(await db.get('blobs',id))?.data:await db.previewBlob(id,tier,{allowRemoteOriginal});}
      catch(error){emit({phase:'failed',tier:imageTierName,context:context(),source:'store',waitMs,durationMs:Date.now()-started,error});throw error;}
      if(disposed||epoch!==generation||itemVersion!==version(id))return '';
      if(!blob){const error=Error('图片尚未同步到可读取位置');emit({phase:'failed',tier:imageTierName,context:context(),source:'store',waitMs,durationMs:Date.now()-started,error});throw error;}
      if(full&&urls.has(id))return urls.get(id);
      const url=URL.createObjectURL(blob);
      if(full){urls.set(id,url);sizes.set(id,blob.size);}
      else if(tier===COVER_EDGE){previews.set(id,url);previewSizes.set(id,blob.size);}
      else{variants.set(key,{id,tier,url});variantSizes.set(id+':'+tier,blob.size);}
      emit({phase:'loaded',tier:imageTierName,context:context(),source:'store',waitMs,durationMs:Date.now()-started});
      queueTrim();return url;
    },resolve,reject};jobs.set(key,job);queue.push(job);});
    pending.set(key,task);task.finally(()=>{if(pending.get(key)===task)pending.delete(key);if(jobs.get(key)===job)jobs.delete(key);}).catch(()=>{});
    pump();return task;
  }
  // Scrolling users care about the items at their *new* stopping position.
  // Re-rank waiting jobs at dispatch time, rather than letting previously
  // approached rows monopolize every available COS download slot.
  function viewportDistances(){
    const distances=new Map();
    for(const img of root.querySelectorAll('img[data-private-image-id]')){
      if(!img.isConnected)continue;
      const rect=img.getBoundingClientRect();if(rect.width<=0||rect.height<=0)continue;
      const distance=Math.max(0,rect.top-innerHeight,-rect.bottom)+
        Math.max(0,rect.left-innerWidth,-rect.right),id=img.dataset.privateImageId;
      distances.set(id,Math.min(distance,distances.get(id)??Infinity));
    }
    return distances;
  }
  function pump(){
    if(disposed||!queue.length)return;
    const distances=viewportDistances();
    // A page switch detaches its cards. Drop their queued, element-only work
    // before it can consume a COS slot needed by the newly visible route.
    for(let i=queue.length-1;i>=0;i--){
      const job=queue[i];
      if(job.ephemeral&&job.id!==focusedID&&!distances.has(job.id)){
        queue.splice(i,1);
        pending.delete(job.key);jobs.delete(job.key);
        job.resolve('');
      }
    }
    while(!disposed&&queue.length){
      if(queue.length>1){
        const priority=job=>job.id===focusedID?-1:distances.get(job.id)??1e9;
        let best=0,rank=priority(queue[0]);
        for(let i=1;i<queue.length;i++){
          const next=priority(queue[i]);
          if(next<rank){rank=next;best=i;if(rank===-1)break;}
        }
        if(best)queue.unshift(queue.splice(best,1)[0]);
      }
      const job=queue[0],focused=job.id===focusedID;
      // A newly opened detail may use one temporary slot while old gallery
      // downloads finish. A fast scroll can also leave every normal slot
      // occupied by offscreen covers; give the new visible row one slot.
      const visibleActive=[...activeIDs.keys()].filter(id=>distances.get(id)===0).length;
      const staleActive=[...activeIDs.keys()].some(id=>(distances.get(id)??Infinity)>0);
      // A new page may need several covers while old-page requests are still
      // finishing. On a tablet, two visible covers can start immediately;
      // the opened detail gets both its quick cover and sharp display image.
      const scrollBoost=!focused&&!focusedActive&&scrollActive<2&&staleActive&&
        visibleActive<2&&distances.get(job.id)===0;
      if(active>=concurrency&&(!focused||focusedActive>=2)&&!scrollBoost)break;
      queue.shift();active++;activeIDs.set(job.id,(activeIDs.get(job.id)||0)+1);
      if(focused)focusedActive++;else if(active>concurrency)scrollActive++;
      const boosted=!focused&&active>concurrency;
      job.run().then(job.resolve,job.reject).finally(()=>{active--;const count=activeIDs.get(job.id)||0;if(count<=1)activeIDs.delete(job.id);else activeIDs.set(job.id,count-1);if(focused)focusedActive--;if(boosted)scrollActive--;pump();});
    }
  }

  function resolve(img,knownID){
    const src=img.getAttribute('src')||'',at=src.indexOf('#shiye-image='),known=identity(src);
    let id=knownID||known?.id;if(!id&&at>=0){try{id=decodeURIComponent(src.slice(at+13));}catch{return;}}
    if(!id||img.dataset.privateImageLoading||disposed)return;
    const epoch=generation,itemVersion=version(id),stamp=epoch+':'+itemVersion;
    img.dataset.privateImageId=id;img.dataset.privateImageLoading=stamp;
    const current=()=>!disposed&&epoch===generation&&itemVersion===version(id);
    const target=fullView(img)?displayTier(img):COVER_EDGE;
    // Never fetch the original for a grid thumbnail; original fallback is
    // permitted only in editing views with a failed COS derivative.
    const full=brokenPreviews.has(id)&&fullView(img);
    void(async()=>{
      let shown=src;
      let finalShown=false;
      const cached=cachedChoice(id,target);
      if(cached&&!full&&img.isConnected&&img.getAttribute('src')===src){
        if(src!==cached.url)img.src=cached.url;
        shown=cached.url;
      }
      // Enqueue the small source first for detail. Its bytes can paint while
      // the larger display derivative is still loading.
      const baseTask=target>COVER_EDGE&&!cached&&!full?load(id,false,{ephemeral:true}):null;
      const finalTask=load(id,full?true:target,{ephemeral:true});
      if(baseTask)void baseTask.then(preview=>{
        if(!current()||finalShown||!preview||!img.isConnected||img.getAttribute('src')!==shown)return;
        if(shown!==preview)img.src=preview;
        shown=preview;
      }).catch(error=>{if(current())onError(error);});
      const url=await finalTask;finalShown=true;if(!current())return;
      if(url&&img.isConnected&&img.getAttribute('src')===shown){if(img.getAttribute('src')!==url)img.src=url;delete img.dataset.imageError;retryCounts.delete(id);const timer=retryTimers.get(id);if(timer){clearTimeout(timer);retryTimers.delete(id);}}
      else if(!url&&img.isConnected){img.dataset.imageError='true';scheduleRetry(id);}
    })().catch(error=>{if(current()&&img.isConnected){img.dataset.imageError='true';
      // A failed higher tier must not erase a usable low-resolution image.
      if(!identity(img.getAttribute('src')||''))img.src=placeholder(id);
      scheduleRetry(id);onError(error);}}).finally(()=>{if(img.dataset.privateImageLoading===stamp){delete img.dataset.privateImageLoading;scheduleUpgrade(img);}});
  }
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);resolve(e.target,e.target.dataset.privateImageId);}},{rootMargin:'220px'}):null;
  const sizingObserver=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{for(const {target:img} of entries)scheduleUpgrade(img);}):null;
  const onViewportResize=()=>{for(const img of root.querySelectorAll('img[data-private-image-id]'))scheduleUpgrade(img);};
  globalThis.addEventListener?.('resize',onViewportResize);
  function onScreen(img){const box=img.getBoundingClientRect();return box.width>0&&box.height>0&&box.bottom>=-220&&box.top<=innerHeight+220&&box.right>=-220&&box.left<=innerWidth+220;}
  function scan(node){if(disposed||node.nodeType!==1)return;const images=node.matches('img')?[node]:node.querySelectorAll('img');for(const img of images){
    if(!observed.has(img)){observed.add(img);if(fullView(img))sizingObserver?.observe(img);img.addEventListener('error',()=>{
      const id=img.dataset.privateImageId,src=img.getAttribute('src');if(!id||!src?.startsWith('blob:'))return;
      const derived=identity(src);
      if(derived&&!derived.full){
        brokenPreviews.add(id);emit({phase:'decoded-failed',tier:derived.tier===COVER_EDGE?'cover':'display',context:focusedID===id?'detail':'visible',reason:'decode'});
        if(derived.tier){const key=id+':'+derived.tier;variants.delete(derived.tier+':'+id);variantSizes.delete(key);URL.revokeObjectURL(src);notifyImageInvalidation([id]);}
        else releaseURL(previews,previewSizes,id);
        delete img.dataset.privateImageLoading;img.src=placeholder(id);
        if(fullView(img))resolve(img,id);
        else{img.dataset.imageError='true';scheduleRetry(id);}
        return;
      }
      emit({phase:'decoded-failed',tier:'original',context:focusedID===id?'detail':'visible',reason:'decode'});
      if(src===urls.get(id))releaseURL(urls,sizes,id);
      img.dataset.imageError='true';img.src=placeholder(id);scheduleRetry(id);
    });}
    const src=img.getAttribute('src')||'',known=identity(src);
    if(known)img.dataset.privateImageId=known.id;
    // Warm list thumbnails need no async pass. Editor entry upgrades them.
    const desired=fullView(img)?displayTier(img):COVER_EDGE;
    if(src.includes('#shiye-image=')){if(onScreen(img)||!observer)resolve(img,known?.id);else observer.observe(img);}
    else if(known&&!known.full&&desired>(known.tier||COVER_EDGE))scheduleUpgrade(img);
  }}
  const changes=new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')scan(r.target);else for(const node of r.addedNodes)scan(node);}});
  // Class/style changes are handled by ResizeObserver and IntersectionObserver;
  // observing them on document.body rescanned the ENTIRE gallery every time
  // navigation changed a CSS class.
  changes.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});scan(root);
  return {load,focus(id){focusedID=id||null;if(id)void load(id,false).catch(onError);pump();},retain(ids){for(const id of ids)retained.set(id,(retained.get(id)||0)+1);let released=false;return()=>{if(released)return;released=true;for(const id of ids){const n=retained.get(id)||0;if(n>1)retained.set(id,n-1);else retained.delete(id);}trim();};},retryMissing(){retryMissing();},
    stats:()=>({originals:sizes.size,previews:previewSizes.size,displayVariants:variantSizes.size,originalBytes:[...sizes.values()].reduce((a,b)=>a+b,0),previewBytes:[...previewSizes.values()].reduce((a,b)=>a+b,0),pending:pending.size}),
    invalidate(ids){
      if(ids&&!ids.length)return;const affected=ids?new Set(ids):null;if(!affected){generation++;pending.clear();}notifyImageInvalidation(affected);
      for(const id of affected||new Set([...urls.keys(),...previews.keys(),...[...variants.values()].map(row=>row.id),...root.querySelectorAll('img[data-private-image-id]')].map(img=>typeof img==='string'?img:img.dataset.privateImageId))){versions.set(id,version(id)+1);for(const key of pending.keys())if(key.endsWith(':'+id))pending.delete(key);const timer=retryTimers.get(id);if(timer)clearTimeout(timer);retryTimers.delete(id);retryCounts.delete(id);brokenPreviews.delete(id);}
      for(const [map,accounting] of [[urls,sizes],[previews,previewSizes]])for(const [id,url] of map){if(affected&&!affected.has(id))continue;map.delete(id);accounting.delete(id);URL.revokeObjectURL(url);}
      for(const [key,row] of variants){if(affected&&!affected.has(row.id))continue;variants.delete(key);variantSizes.delete(row.id+':'+row.tier);URL.revokeObjectURL(row.url);}
      for(const img of root.querySelectorAll('img[data-private-image-id]')){const id=img.dataset.privateImageId;if(affected&&!affected.has(id))continue;delete img.dataset.privateImageLoading;delete img.dataset.imageError;img.src=placeholder(id);if(onScreen(img)||!observer)resolve(img,id);else observer.observe(img);}scan(root);
    },
    dispose(){disposed=true;generation++;unbind();changes.disconnect();observer?.disconnect();sizingObserver?.disconnect();globalThis.removeEventListener?.('resize',onViewportResize);if(trimTimer!==null)clearTimeout(trimTimer);for(const timer of retryTimers.values())clearTimeout(timer);retryTimers.clear();for(const timer of resizeTimers.values())clearTimeout(timer);resizeTimers.clear();for(const job of queue.splice(0))job.resolve('');pending.clear();jobs.clear();for(const map of [urls,previews]){for(const url of map.values())URL.revokeObjectURL(url);map.clear();}for(const row of variants.values())URL.revokeObjectURL(row.url);variants.clear();sizes.clear();previewSizes.clear();variantSizes.clear();retained.clear();}
  };
}

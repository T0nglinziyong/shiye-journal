const CACHE='shiye-full-shell-__BUILD_ID__';
const RUNTIME='shiye-runtime-__BUILD_ID__';
const SHELL=__ASSETS__;
const pathOf=url=>new URL(url,self.location.origin).pathname;
const ASSETS=new Set(SHELL.map(pathOf));
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(SHELL))
  // No automatic skipWaiting: existing editors keep using their own version.
));
self.addEventListener('message',event=>{
  if(event.data?.type!=='SHIYE_ACTIVATE_UPDATE')return;
  event.waitUntil((async()=>{
    const pages=await self.clients.matchAll?.({type:'window',includeUncontrolled:true})||[];
    if(pages.length>1){
      event.source?.postMessage?.({type:'SHIYE_UPDATE_BLOCKED',reason:'other-tabs'});
      return;
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await self.clients.claim();
  const keys=await caches.keys();
  // Reclaim only caches belonging to this app, never other sites or models.
  await Promise.all(keys.filter(key=>(key.startsWith('shiye-full-shell-')&&key!==CACHE)||(key.startsWith('shiye-runtime-')&&key!==RUNTIME)).map(key=>caches.delete(key)));
})()));
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).catch(async()=>await caches.match('/')||Response.error()));
    return;
  }
  if(!ASSETS.has(url.pathname)){
    if(!(/^\/assets\/[^/]+\.(?:js|css|woff2?|wasm)$/.test(url.pathname)||
      /^\/vendor\/opencv-shiye\/opencv\.js$/.test(url.pathname)))return;
    event.respondWith(caches.open(RUNTIME).then(async cache=>{
      const cached=await cache.match(req);
      if(cached)return cached;
      const response=await fetch(req);
      if(response.ok)event.waitUntil(cache.put(req,response.clone()));
      return response;
    }));
    return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req)));
});

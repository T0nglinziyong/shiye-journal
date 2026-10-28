let readyPromise=null;

async function loadRuntime(url){
  // Emscripten otherwise resolves its split WASM relative to this hashed
  // worker chunk (or /src/ during development), not the imported OpenCV JS.
  // Vite then answers that missing path with index.html, yielding a WASM
  // "expected magic word" error after candidate-box discovery.
  const runtimeURL=new URL(url,self.location.href);
  self.Module={locateFile:path=>new URL(path,runtimeURL).href};
  importScripts(runtimeURL.href);
  let cv=self.cv;
  if(cv&&typeof cv.then==='function')cv=await cv;
  else if(!cv?.Mat){
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('OpenCV browser runtime initialization timeout')),45000);
      const previous=cv?.onRuntimeInitialized;
      if(!cv){clearTimeout(timer);reject(Error('OpenCV browser runtime did not expose cv'));return;}
      cv.onRuntimeInitialized=()=>{clearTimeout(timer);try{previous?.();}catch{}resolve();};
    });
  }
  if(!cv?.Mat)throw Error('OpenCV browser runtime is not ready');
  return cv;
}

async function initialize(opencvScriptURL){
  if(readyPromise)return readyPromise;
  readyPromise=(async()=>{
    const cv=await loadRuntime(opencvScriptURL);
    const {processVision}=await import('./opencv-worker.js');
    self.postMessage({type:'ready'});
    return {cv,processVision};
  })();
  return readyPromise;
}

self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){await initialize(data.opencvScriptURL);return;}
    const {cv,processVision}=await readyPromise;
    const result=await processVision(cv,data.operation,data.parameters);
    self.postMessage({id:data.id,result},ArrayBuffer.isView(result?.pixels)?[result.pixels.buffer]:[]);
  }catch(error){
    if(data?.id!=null)self.postMessage({id:data.id,error:'本机图像处理失败：'+String(error?.message||error)});
    else throw error;
  }
};

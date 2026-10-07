let readyPromise=null;

async function loadRuntime(url){
  importScripts(url);
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

async function initialize(opencvScriptURL,fallbackOpenCVScriptURL){
  if(readyPromise)return readyPromise;
  readyPromise=(async()=>{
    let cv;
    try{
      cv=await loadRuntime(opencvScriptURL);
    }catch(primaryError){
      // During rollout or cache recovery the generated lite runtime may not
      // exist yet. Preserve recognition by falling back to the pinned package
      // build rather than failing the whole import flow.
      if(!fallbackOpenCVScriptURL||fallbackOpenCVScriptURL===opencvScriptURL)throw primaryError;
      try{delete self.cv;}catch{self.cv=undefined;}
      cv=await loadRuntime(fallbackOpenCVScriptURL);
    }
    const {processVision}=await import('./opencv-worker.js');
    self.postMessage({type:'ready'});
    return {cv,processVision};
  })();
  return readyPromise;
}

self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){await initialize(data.opencvScriptURL,data.fallbackOpenCVScriptURL);return;}
    const {cv,processVision}=await readyPromise;
    const result=await processVision(cv,data.operation,data.parameters);
    self.postMessage({id:data.id,result},ArrayBuffer.isView(result?.pixels)?[result.pixels.buffer]:[]);
  }catch(error){
    if(data?.id!=null)self.postMessage({id:data.id,error:'本机图像处理失败：'+String(error?.message||error)});
    else throw error;
  }
};

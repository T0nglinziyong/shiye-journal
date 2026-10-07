import cvModule from '@techstark/opencv-js';
import {processVision} from './opencv-worker.js';

const ready=(async()=>{
  let cv=cvModule;
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
})();

self.onmessage=async({data})=>{
  try{
    const cv=await ready;
    const result=await processVision(cv,data.operation,data.parameters);
    self.postMessage({id:data.id,result},ArrayBuffer.isView(result?.pixels)?[result.pixels.buffer]:[]);
  }catch(error){
    self.postMessage({id:data.id,error:'本机图像处理失败：'+String(error?.message||error)});
  }
};

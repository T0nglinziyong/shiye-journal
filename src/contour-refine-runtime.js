let worker,sequence=0;const pending=new Map();
function reset(message){worker?.terminate();worker=null;for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error(message));}pending.clear();}
export function refineMaterialsWithContours(pixels,width,height,candidates,mode='hybrid'){
  if(!worker){
    worker=new Worker(new URL('./contour-refine-worker.js',import.meta.url),{type:'module'});
    worker.onerror=()=>reset('浏览器轮廓引擎失败，已保留传统识别结果');
    worker.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;clearTimeout(job.timer);pending.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data.result);};
  }
  return new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('浏览器高质量轮廓处理超时'));},90000);
    pending.set(id,{resolve,reject,timer});
    // Do not transfer frame.data: other refiners/crop generation may still use it.
    worker.postMessage({id,pixels,width,height,candidates,mode});
  });
}
// Heavy vision code is downloaded only when image processing is requested.
let worker, sequence=0;
const pending=new Map();
export function visionStatus(){return [...pending.values()].map(job=>({operation:job.operation,elapsedMS:Math.round(performance.now()-job.startedAt)}));}
export function visionTask(operation,parameters){
  if(!worker){
    worker=new Worker(new URL('./opencv-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;clearTimeout(job.timer);pending.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data.result);};
    worker.onerror=()=>{for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('本机图像引擎加载失败，请联网后重试'));}pending.clear();worker.terminate();worker=null;};
  }
  return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('本机图像处理超时，请缩小照片后重试'));},60000);pending.set(id,{resolve,reject,timer,operation,startedAt:performance.now()});worker.postMessage({id,operation,parameters});});
}

import opencvScriptURL from '@techstark/opencv-js/dist/opencv.js?url';

// Heavy vision code is downloaded only when image processing is requested.
let worker,sequence=0;
const pending=new Map();
let initialized=false;
export function visionStatus(){return [...pending.values()].map(job=>({operation:job.operation,elapsedMS:Math.round(performance.now()-job.startedAt)}));}
function ensureWorker(){
  if(worker)return;
  worker=new Worker(new URL('./opencv-worker-browser.js',import.meta.url));
  worker.onmessage=({data})=>{
    if(data?.type==='ready'){initialized=true;return;}
    const job=pending.get(data.id);if(!job)return;clearTimeout(job.timer);pending.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data.result);
  };
  worker.onerror=event=>{const detail=[event?.message,event?.filename,event?.lineno&&('line '+event.lineno)].filter(Boolean).join(' · ');for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('本机图像引擎加载失败'+(detail?'：'+detail:'，请联网后重试')));}pending.clear();worker.terminate();worker=null;initialized=false;};
  worker.postMessage({type:'init',opencvScriptURL});
}
export function visionTask(operation,parameters){
  ensureWorker();
  return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('本机图像处理超时，请缩小照片后重试'));},90000);pending.set(id,{resolve,reject,timer,operation,startedAt:performance.now()});const buffers=parameters.transferInput?[...new Set(Object.values(parameters).filter(ArrayBuffer.isView).map(a=>a.buffer))]:[];worker.postMessage({id,operation,parameters},buffers);});
}

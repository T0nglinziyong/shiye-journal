const liteOpenCVScriptURL='/vendor/opencv-shiye/opencv.js';
export function visionRuntimeFlavor(){return 'lite';}

const slots=[];
let sequence=0;
const pending=new Map();
const now=()=>globalThis.performance?.now?.()??Date.now();

export function visionParallelism(){
  if(typeof navigator==='undefined')return 1;
  return Number(navigator.hardwareConcurrency||0)>=8?2:1;
}
export function visionStatus(){
  return [...pending.values()].map(job=>({operation:job.operation,worker:job.slot,elapsedMS:Math.round(now()-job.startedAt)}));
}
function resetSlot(index,error){
  const slot=slots[index];if(!slot)return;
  clearTimeout(slot.readyTimer);
  slot.rejectReady(error);
  slot.worker?.terminate?.();slots[index]=null;
  for(const [id,job] of pending){if(job.slot!==index)continue;clearTimeout(job.timer);pending.delete(id);job.reject(error);}
}
function ensureWorker(index=0){
  if(slots[index])return slots[index].readyPromise;
  let resolveReady,rejectReady;
  const readyPromise=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;}),
    worker=new Worker(new URL('./opencv-worker-browser.js',import.meta.url)),
    slot={worker,readyPromise,initialized:false,rejectReady,readyTimer:null};
  slots[index]=slot;
  slot.readyPromise.catch(()=>{}); // callers may fire-and-forget warmup
  slot.readyTimer=setTimeout(()=>resetSlot(index,Error('图像引擎初始化超时，可重新尝试')),50000);
  worker.onmessage=({data})=>{
    if(slots[index]!==slot)return;
    if(data?.type==='ready'){clearTimeout(slot.readyTimer);slot.initialized=true;resolveReady(true);return;}
    const job=pending.get(data.id);if(!job)return;
    clearTimeout(job.timer);pending.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data.result);
  };
  worker.onerror=event=>{
    if(slots[index]!==slot)return;
    const detail=[event?.message,event?.filename,event?.lineno&&('line '+event.lineno)].filter(Boolean).join(' · '),
      error=Error('本机图像引擎加载失败'+(detail?'：'+detail:'，请联网后重试'));
    resetSlot(index,error);
  };
  try{worker.postMessage({type:'init',opencvScriptURL:liteOpenCVScriptURL});}
  catch(error){resetSlot(index,error);}
  return readyPromise;
}
function taskOnSlot(index,operation,parameters){
  ensureWorker(index);const slot=slots[index];
  return new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>resetSlot(index,Error('本机图像处理超时，已重新启动引擎；请重试')),90000);
    pending.set(id,{resolve,reject,timer,operation,slot:index,startedAt:now()});
    const buffers=parameters.transferInput?[...new Set(Object.values(parameters).filter(ArrayBuffer.isView).map(a=>a.buffer))]:[];
    try{slot.worker.postMessage({id,operation,parameters},buffers);}
    catch(error){resetSlot(index,error);}
  });
}
export function prewarmVision({parallel=false}={}){
  const count=parallel?visionParallelism():1;
  return Promise.all(Array.from({length:count},(_,i)=>ensureWorker(i))).then(()=>true);
}
export function visionTask(operation,parameters){return taskOnSlot(0,operation,parameters);}
export async function visionParallelTasks(operation,parameterList){
  if(!parameterList?.length)return [];
  const count=Math.min(visionParallelism(),parameterList.length);
  await prewarmVision({parallel:count>1});
  const results=[];
  for(let offset=0;offset<parameterList.length;offset+=count){
    const batch=parameterList.slice(offset,offset+count);
    results.push(...await Promise.all(batch.map((parameters,i)=>taskOnSlot(i,operation,parameters))));
  }
  return results;
}

// OpenCV initialization occurs on explicit import intent; no global idle WASM compilation.


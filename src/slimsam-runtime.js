let worker,sequence=0;const pending=new Map();
function reset(message){worker?.terminate();worker=null;for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error(message));}pending.clear();}
export function refineMaterialsInBrowser(pixels,width,height,boxes,onProgress=()=>{},foregroundPoints=[]){
  if(!worker){worker=new Worker(new URL('./slimsam-worker.js',import.meta.url),{type:'module'});
    worker.onerror=()=>reset('浏览器分割模型加载失败，请检查网络或改用传统识别');
    worker.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;
      if(data.progress){job.onProgress(data.progress);return;}
      clearTimeout(job.timer);pending.delete(data.id);data.error?job.reject(Error('浏览器分割失败：'+data.error)):job.resolve(data.result);
    };
  }
  return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reset('浏览器分割超时，请改用传统快速识别；照片没有上传'),300000);
    pending.set(id,{resolve,reject,timer,onProgress});const copy=pixels.slice();worker.postMessage({id,pixels:copy,width,height,boxes,foregroundPoints},[copy.buffer]);
  });
}

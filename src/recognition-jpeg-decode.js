let worker=null,disabled=false,sequence=0;
const pending=new Map();

function failWorker(error){
  worker?.terminate();worker=null;disabled=true;
  for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}
  pending.clear();
}

export function decodeJpegOffThread(blob,onPhase){
  if(disabled||typeof Worker==='undefined')return Promise.reject(Error('JPEG Worker 不可用'));
  if(!worker){
    try{
      worker=new Worker(new URL('./recognition-jpeg-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{
        const item=pending.get(data.id);if(!item)return;
        pending.delete(data.id);clearTimeout(item.timer);
        data.error?item.reject(Error(data.error)):item.resolve(data);
      };
      worker.onerror=()=>failWorker(Error('JPEG Worker 加载失败'));
    }catch(error){disabled=true;return Promise.reject(error);}
  }
  onPhase?.('read');
  return blob.arrayBuffer().then(bytes=>new Promise((resolve,reject)=>{
    onPhase?.('decode');
    const id=++sequence;
    const timer=setTimeout(()=>failWorker(Error('JPEG Worker 超时')),30000);
    pending.set(id,{resolve,reject,timer});
    try{worker.postMessage({id,bytes},[bytes]);}
    catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
  }));
}

import {graphicsWorkerSource} from './generated/graphics-worker-source.js';
// A terminable worker bounds actual computation; every exit releases its resources.
export function calculateGraphics(request,{signal,timeout=10000}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(signal.reason||Error('图形计算已取消'));return;}
  const url=URL.createObjectURL(new Blob([graphicsWorkerSource],{type:'text/javascript'}));
  let worker;
  try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);reject(error);return;}
  URL.revokeObjectURL(url);
  let settled=false,timer;
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(result);};
  const abort=()=>finish(signal.reason||Error('图形计算已取消'));
  timer=setTimeout(()=>finish(Error('图形计算超时，请减少路径或增大容差')),Math.min(10000,Math.max(1,Number(timeout)||10000)));
  worker.onmessage=({data})=>data.ok?finish(null,data.result):finish(Object.assign(Error(data.message),{code:data.code}));
  worker.onerror=event=>finish(Error(event.message||'图形计算失败'));
  signal?.addEventListener('abort',abort,{once:true});
  try{worker.postMessage(request);}catch(error){finish(error);}
 });
}

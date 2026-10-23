import {graphicsWorkerSource} from './generated/graphics-worker-source.js';
// Termination bounds computation, rather than a timeout around synchronous JS.
export function calculateGraphics(request,{signal,timeout=10000}={}){
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(new Blob([graphicsWorkerSource],{type:'text/javascript'})),worker=new Worker(url);URL.revokeObjectURL(url);
  const finish=(error,result)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(result);};
  const abort=()=>finish(signal.reason||Error('图形计算已取消'));
  const timer=setTimeout(()=>finish(Error('图形计算超时，请减少路径或增大容差')),timeout);
  worker.onmessage=({data})=>data.ok?finish(null,data.result):finish(Object.assign(Error(data.message),{code:data.code}));
  worker.onerror=event=>finish(Error(event.message||'图形计算失败'));
  if(signal?.aborted)return abort();signal?.addEventListener('abort',abort,{once:true});worker.postMessage(request);
 });
}

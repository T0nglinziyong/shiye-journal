import {BACKUP_BYTES_LIMIT} from './backup-limits.js';
// The ZIP engine is loaded only when the user explicitly exports/restores.
// Compression, hashing and ZIP parsing run in a module Worker, never the UI thread.
const MIME='application/zip';
const BUFFER_LIMIT=192*1024*1024;
// Keep export and streamed restore on the same explicit capacity contract.
const RESTORE_LIMIT=BACKUP_BYTES_LIMIT;
const makeWorker=()=>new Worker(new URL('./backup-zip-worker.js',import.meta.url),{type:'module'});

export async function createZipBackup({records,blobIDs,loadBlob,onChunk,onProgress=()=>{},beforeFinalize=null,maxBufferedBytes=BUFFER_LIMIT}){
  if(typeof Worker==='undefined')throw Error('此浏览器无法在后台创建 ZIP 备份');
  const worker=makeWorker(),parts=[],state={bytes:0},pending=new Map();
  let errored=false,write=Promise.resolve();
  const rejectAll=error=>{
    if(errored)return;errored=true;
    for(const [name,{reject}] of pending){pending.delete(name);reject(error);}
  };
  const awaitReply=(type,body,expected)=>{
    if(errored)return Promise.reject(Error('ZIP 任务已经失败'));
    const promise=new Promise((resolve,reject)=>pending.set(expected,{resolve,reject}));
    worker.postMessage({type,...body});
    return promise;
  };
  worker.onerror=event=>rejectAll(Error('ZIP 处理失败：'+(event.message||'Worker 无响应')));
  worker.onmessage=event=>{
    const message=event.data||{};
    if(message.type==='failure'){rejectAll(Error(message.error||'ZIP 构建失败'));return;}
    if(message.type==='chunk'){
      // Backpressure: acknowledge only after a durable file write or memory
      // collection. The worker does not fetch another source chunk beforehand.
      write=write.then(async()=>{
        const bytes=message.bytes;
        state.bytes+=bytes.length;
        if(state.bytes>RESTORE_LIMIT)throw Error('完整备份超过当前应用可恢复的 2 GB 上限；未生成无法恢复的备份文件');
        if(!onChunk){
          if(state.bytes>maxBufferedBytes)throw Error('备份超过本浏览器内存导出上限，请在支持直接写入文件的桌面浏览器导出');
          parts.push(bytes);
        }else await onChunk(bytes);
        worker.postMessage({type:'ack',seq:message.seq});
      }).catch(rejectAll);
      return;
    }
    const call=pending.get(message.type);
    if(call){pending.delete(message.type);call.resolve(message);}
  };
  try{
    await awaitReply('begin',{records},'ready');
    for(const [index,id] of blobIDs.entries()){
      const record=await loadBlob(id);
      if(!(record?.data instanceof Blob))throw Error('素材 '+id+' 的高清原图无法读取；未输出不完整备份');
      await awaitReply('image',{record},'image-done');
      onProgress({stage:'image',current:index+1,total:blobIDs.length});
    }
    if(beforeFinalize)await beforeFinalize();
    await awaitReply('finish',{},'done');
    await write;
    if(errored)throw Error('备份输出失败');
    return onChunk?{bytes:state.bytes}:new Blob(parts,{type:MIME});
  }finally{worker.terminate();}
}

export async function readZipBackup(file,{stagingName=null,onProgress=()=>{}}={}){
  if(typeof Worker==='undefined')throw Error('此浏览器不能安全校验 ZIP 备份');
  const worker=makeWorker();
  try{
    return await new Promise((resolve,reject)=>{
      worker.onerror=event=>reject(Error('备份解压失败：'+(event.message||'Worker 出错')));
      worker.onmessage=event=>{
        if(event.data?.type==='restore-progress')onProgress(event.data);
        if(event.data?.type==='failure')reject(Error(event.data.error||'备份校验失败'));
        if(event.data?.type==='restored')resolve(event.data.stores);
      };
      worker.postMessage({type:'restore',file,stagingName});
    });
  }finally{worker.terminate();}
}

// Browser PUTs expose progress through XHR. Abort stalled transfers, not slow
// transfers that are still advancing. Never include signed URLs in diagnostics.
export function uploadCOSObject(url,{headers,body,idleTimeoutMs=30000,totalTimeoutMs=600000,
  xhrFactory=()=>new XMLHttpRequest(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
  return new Promise((resolve,reject)=>{
    const xhr=xhrFactory();let idleTimer,totalTimer,settled=false;
    const transfer={bytes:body.size,loaded:0,phase:'connecting',status:null,requestId:null};
    const finish=(error,response)=>{
      if(settled)return;settled=true;clearTimer(idleTimer);clearTimer(totalTimer);
      if(error){error.transfer={...transfer};reject(error);}else resolve(response);
    };
    const timeout=()=>{
      const error=Object.assign(Error('图片传输长时间没有进度'),{name:'TimeoutError'});
      finish(error);xhr.abort();
    };
    const progress=()=>{if(settled)return;clearTimer(idleTimer);idleTimer=setTimer(timeout,idleTimeoutMs);};
    xhr.open('PUT',url,true);
    for(const [name,value] of Object.entries(headers||{}))xhr.setRequestHeader(name,value);
    xhr.upload.onprogress=event=>{
      if(event.loaded>transfer.loaded){transfer.loaded=event.loaded;transfer.phase='uploading';progress();}
    };
    xhr.upload.onload=()=>{transfer.loaded=body.size;transfer.phase='response';progress();};
    xhr.onload=()=>{
      if(xhr.status===0){xhr.onerror();return;}
      transfer.status=xhr.status;
      transfer.requestId=xhr.getResponseHeader('x-cos-request-id');
      finish(null,{ok:xhr.status>=200&&xhr.status<300,status:xhr.status,transfer:{...transfer}});
    };
    xhr.onerror=()=>{
      // Full PUT bytes + no readable HTTP status means an ambiguous result:
      // CORS/preflight/response or network failure. Never acknowledge writes.
      const sent=transfer.loaded>=body.size&&transfer.phase==='response';
      finish(Object.assign(Error(sent?'COS 上传已发送但未收到有效响应，请检查 PUT 跨域、签名及网络':'图片传输连接失败'),{
        name:'NetworkError',code:sent?'SHIYE_COS_NO_RESPONSE':'SHIYE_COS_NETWORK',responseUnknown:sent
      }));
    };
    xhr.onabort=()=>finish(Object.assign(Error('图片传输中断'),{name:'AbortError'}));
    progress();totalTimer=setTimer(timeout,totalTimeoutMs);
    try{xhr.send(body);}catch(error){finish(error);}
  });
}

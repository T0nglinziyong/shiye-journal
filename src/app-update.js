// Service worker updates are offered through the React shell only after the
// currently waiting worker is known. Activation never interrupts local edits.
export async function registerSafeUpdate({flushLocal,isBusy=()=>false,onError=console.warn,onReady=()=>{},onStatus=()=>{}}={}){
  if(!('serviceWorker' in navigator)||location.protocol!=='https:')return {activate:async()=>{}};
  const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
  let requested=false,busy=false,watchdog=null;
  const clearWatchdog=()=>{if(watchdog){clearTimeout(watchdog);watchdog=null;}};
  const show=()=>{if(registration.waiting&&!requested)onReady(true);};
  const activate=async()=>{
    if(busy)return;
    if(!registration.waiting){onStatus('');onError(Error('更新已不在等待中，请刷新页面重新检查'));return;}
    if(isBusy()){onStatus('');onError(Error('仍有操作正在进行，请完成后手动更新'));return;}
    busy=true;onStatus('正在确认本机保存…');
    try{await flushLocal();
      if(!registration.waiting)throw Error('更新等待状态已变化，请刷新页面重新检查');
      requested=true;onStatus('正在切换新版本…');
      registration.waiting.postMessage({type:'SHIYE_ACTIVATE_UPDATE'});
      clearWatchdog();watchdog=setTimeout(()=>{
        if(!requested)return;requested=false;busy=false;onStatus('');show();
        onError(Error('更新等待超时，请关闭其他拾页页面后重试'));
      },30000);
    }catch(error){requested=false;busy=false;clearWatchdog();onStatus('');onError(error);}
  };
  show();
  registration.addEventListener('updatefound',()=>{
    const worker=registration.installing;
    worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)show();});
  });
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.data?.type!=='SHIYE_UPDATE_BLOCKED')return;
    requested=false;busy=false;clearWatchdog();onStatus('');show();
    onError(Error('请先关闭其他拾页标签页，避免更新中混用不同版本'));
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!requested)return;
    clearWatchdog();onReady(false);location.reload();
  });
  return {activate};
}

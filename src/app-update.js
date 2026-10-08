// An update is opt-in and only after the current user's edits reach durable
// local storage. No online flush, no automatic reload during canvas editing.
export async function registerSafeUpdate({flushLocal,isBusy=()=>false,onError=console.warn}={}){
  if(!('serviceWorker' in navigator)||location.protocol!=='https:')return;
  const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
  let button=null,requested=false;
  const hide=()=>{button?.remove();button=null;};
  const show=()=>{
    if(!registration.waiting||button)return;
    const target=document.querySelector('.top-actions');
    if(!target)return;
    button=document.createElement('button');button.type='button';
    button.className='btn mini shiye-update-ready';
    button.textContent='更新拾页';button.title='仅在保存本机修改后更新，不会自动打断编辑';
    button.onclick=async()=>{
      if(isBusy()){onError(Error('仍有操作正在进行，请完成后手动更新'));return;}
      button.disabled=true;button.textContent='正在确认本机保存…';
      try{
        await flushLocal();
        requested=true;
        registration.waiting?.postMessage({type:'SHIYE_ACTIVATE_UPDATE'});
      }catch(error){button.disabled=false;button.textContent='更新拾页';onError(error);}
    };
    target.append(button);
  };
  if(registration.waiting)show();
  registration.addEventListener('updatefound',()=>{
    const worker=registration.installing;
    worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)show();});
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!requested)return;
    hide();location.reload();
  });
}

// One lifecycle for both import and project outboxes. A failed upload remains
// durable; returning to the app or restoring connectivity retries it quietly.
export function createSyncResumer({flush,canRun=()=>true,onError=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
  let active=null,timer=null,attempt=0,stopped=false,suspended=false;
  const cancel=()=>{if(timer!==null){clearTimer(timer);timer=null;}};
  const conflict=error=>/云端版本已变化|另一设备已更新|\bconflict\b/i.test(error?.message||'');
  const wake=()=>{
    if(stopped||suspended||!canRun())return Promise.resolve();
    cancel();if(active)return active;
    active=Promise.resolve().then(flush).then(()=>{attempt=0;},error=>{
      onError(error);
      if(!stopped&&!suspended&&!conflict(error)){
        const delay=Math.min(60000,2000*2**Math.min(attempt++,5));
        timer=setTimer(()=>{timer=null;void wake();},delay);
      }
    }).finally(()=>{active=null;});
    return active;
  };
  return {wake,suspend(){suspended=true;cancel();},resume(){suspended=false;return wake();},stop(){stopped=true;cancel();},status:()=>({running:!!active,retryScheduled:timer!==null,suspended})};
}

// Bound concurrent API requests across automatic and user-triggered batches.
// These are parallel network requests, not CPU threads or automatic retries.
export function createClassificationQueue(limit=3) {
  if(!Number.isInteger(limit)||limit<1)throw Error('并发数必须是正整数');
  const foreground=[],background=[];
  let active=0,foregroundStreak=0;
  const pump=()=>{
    while(active<limit&&(foreground.length||background.length)){
      const useBackground=background.length&&(!foreground.length||foregroundStreak>=3);
      const job=useBackground?background.shift():foreground.shift();
      foregroundStreak=useBackground?0:foregroundStreak+1;
      job.signal?.removeEventListener('abort',job.abort);
      if(job.signal?.aborted){job.reject(job.signal.reason||new DOMException('任务已取消','AbortError'));continue;}
      active++;
      let work;try{work=job.run(job.signal);}catch(error){work=Promise.reject(error);}
      Promise.resolve(work).then(job.resolve,job.reject).finally(()=>{active--;pump();});
    }
  };
  return {
    schedule(run,{priority='background',signal}={}){
      return new Promise((resolve,reject)=>{
        if(signal?.aborted){reject(signal.reason||new DOMException('任务已取消','AbortError'));return;}
        const queue=priority==='foreground'?foreground:background;
        const job={run,resolve,reject,signal,abort:()=>{
          const index=queue.indexOf(job);
          if(index<0)return;
          queue.splice(index,1);reject(signal.reason||new DOMException('任务已取消','AbortError'));
        }};
        queue.push(job);signal?.addEventListener('abort',job.abort,{once:true});
        pump();
      });
    }
  };
}

export const classificationQueue=createClassificationQueue(3);

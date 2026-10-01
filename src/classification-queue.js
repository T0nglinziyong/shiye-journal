// Bound concurrent API requests across automatic and user-triggered batches.
// These are parallel network requests, not CPU threads or automatic retries.
export function createClassificationQueue(limit=3) {
  if(!Number.isInteger(limit)||limit<1)throw Error('并发数必须是正整数');
  const foreground=[],background=[];
  let active=0;
  const pump=()=>{
    while(active<limit&&(foreground.length||background.length)){
      const job=foreground.shift()||background.shift();active++;
      let work;try{work=job.run();}catch(error){work=Promise.reject(error);}
      Promise.resolve(work).then(job.resolve,job.reject).finally(()=>{active--;pump();});
    }
  };
  return {
    schedule(run,{priority='background'}={}){
      return new Promise((resolve,reject)=>{
        (priority==='foreground'?foreground:background).push({run,resolve,reject});
        pump();
      });
    }
  };
}

export const classificationQueue=createClassificationQueue(3);

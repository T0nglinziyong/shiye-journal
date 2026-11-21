// Keep a bounded number of files live, replacing each completed job immediately.
// A slow file must not leave all other upload slots idle at a chunk boundary.
export async function prepareUploadJobs(jobs,upload,{limit=3}={}){
  const failures=new Map();let next=0;
  await Promise.all(Array.from({length:Math.min(jobs.length,Math.max(1,limit))},async()=>{
    while(next<jobs.length){
      const job=jobs[next++];
      try{await upload(job);}catch(error){
        if(!failures.has(job.operationID))failures.set(job.operationID,error);
      }
    }
  }));
  return failures;
}

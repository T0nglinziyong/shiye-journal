export function createJobLanePool({slots,claim,process,notifyFailed,onError}){
  const pendingHints=new Set(),claimingHints=new Set(),processingJobs=new Set(),activeLanes=new Set();
  const takeHint=()=>{
    const id=pendingHints.values().next().value;
    if(id)pendingHints.delete(id);
    return id||null;
  };
  const drain=()=>{
    while(pendingHints.size&&activeLanes.size<slots.length){
      const index=slots.findIndex((_,slot)=>!activeLanes.has(slot));
      if(index<0)break;
      activeLanes.add(index);
      void runLane(index,takeHint()).catch(onError);
    }
  };
  async function runLane(index,initialHint){
    let requested=initialHint;
    try{
      for(;;){
        if(requested)claimingHints.add(requested);
        let job;
        try{job=await claim(requested);}catch(error){onError(error);return;}
        if(requested)claimingHints.delete(requested);
        for(const id of job?.failed_ids||[])await notifyFailed(id);
        requested=null;
        if(!job?.id){
          requested=takeHint();
          if(requested)continue;
          return;
        }
        processingJobs.add(job.id);
        try{await process(job,slots[index]);}
        finally{processingJobs.delete(job.id);}
        requested=takeHint();
      }
    }finally{
      if(requested)claimingHints.delete(requested);
      activeLanes.delete(index);
      drain();
    }
  }
  return {get busy(){return activeLanes.size>0||pendingHints.size>0;},hint(id){
    if(processingJobs.has(id)||claimingHints.has(id))return;
    pendingHints.add(id);drain();
  }};
}

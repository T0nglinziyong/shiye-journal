import {classificationQueue} from './classification-queue.js';

// Session-only activity, separate from the user's review status and cloud data.
export function createAssetOrganization() {
  const jobs=new Map(),listeners=new Set();
  const notify=()=>{for(const fn of listeners)fn();};
  return {
    status:id=>jobs.get(id)?.status,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    clear(){jobs.clear();notify();},
    async run(records,{waitForSave=async()=>{},organize,onError=()=>{},priority='background',queue=classificationQueue}={}) {
      const token=Symbol('batch');
      const set=(id,status)=>{if(jobs.get(id)?.token!==token)return;if(status)jobs.set(id,{token,status});else jobs.delete(id);notify();};
      for(const record of records)jobs.set(record.id,{token,status:'queued'});
      notify();
      try{await waitForSave();}catch(error){for(const record of records)set(record.id,'failed');onError(error);return;}
      await Promise.all(records.map(record=>queue.schedule(async()=>{
        if(jobs.get(record.id)?.token!==token)return;
        set(record.id,'running');
        try{await organize(record,()=>jobs.get(record.id)?.token===token);set(record.id,null);}
        catch(error){set(record.id,'failed');onError(error,record);}
      },{priority})));
    }
  };
}

import {classificationQueue} from './classification-queue.js';

// Session-only activity, separate from the user's review status and cloud data.
export function createAssetOrganization() {
  const jobs=new Map(),listeners=new Set();
  const notify=()=>{for(const fn of listeners)fn();};
  return {
    status:id=>jobs.get(id)?.status,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    clear(){for(const job of jobs.values())job.controller.abort();jobs.clear();notify();},
    async run(records,{waitForSave=async()=>{},organize,onError=()=>{},priority='background',queue=classificationQueue}={}) {
      const token=Symbol('batch');
      const set=(id,status)=>{const current=jobs.get(id);if(current?.token!==token)return;if(status)jobs.set(id,{...current,status});else jobs.delete(id);notify();};
      for(const record of records){jobs.get(record.id)?.controller.abort();jobs.set(record.id,{token,status:'queued',controller:new AbortController()});}
      notify();
      try{await waitForSave();}catch(error){if(!records.some(record=>jobs.get(record.id)?.token===token))return;for(const record of records)set(record.id,'failed');onError(error);return;}
      await Promise.all(records.map(record=>{
        const controller=jobs.get(record.id)?.controller;
        if(!controller)return Promise.resolve();
        return queue.schedule(async signal=>{
        if(jobs.get(record.id)?.token!==token)return;
        set(record.id,'running');
        try{await organize(record,()=>jobs.get(record.id)?.token===token&&!signal.aborted,signal);set(record.id,null);}
        catch(error){if(signal.aborted)return;set(record.id,'failed');onError(error,record);}
      },{priority,signal:controller.signal}).catch(error=>{if(error?.name!=='AbortError')throw error;});
      }));
    }
  };
}

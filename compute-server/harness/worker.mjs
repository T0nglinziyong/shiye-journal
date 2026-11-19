import {createJobLanePool} from '../job-lane-pool.mjs';
import {SamDaemonClient} from '../sam-daemon-client.mjs';
import {createCreativeNetwork} from './network.mjs';
import {createDeepSeekCreativeModel} from './deepseek.mjs';
import {runCloudCreativeJob} from './cloud-job.mjs';

export function createCreativeWorker({key,dns='system',samRoot,rpc,store,listCheckpoints,listActive,lookup,notify,logger=console}){
  const network=createCreativeNetwork({dns}),model=createDeepSeekCreativeModel({key,fetcher:network.fetcher});
  const daemons=[new SamDaemonClient(samRoot),new SamDaemonClient(samRoot)],active=new Map(),timers=new Map(),retryUntil=new Map();
  let closed=false,recovering=null;
  const later=(id,delay)=>{
    if(!retryUntil.has(id))retryUntil.set(id,Date.now()+600000);
    if(closed||timers.has(id)||retryUntil.get(id)<=Date.now())return;
    timers.set(id,setTimeout(()=>{timers.delete(id);lanes.hint(id);},Math.max(1000,delay)));
  };
  const lanes=createJobLanePool({slots:daemons,notifyFailed:async()=>{},onError:error=>logger.error('Creative lane failed:',error.message),
    claim:async id=>{
      if(!id||closed)return {};
      try{
        const job=await rpc('shiye_claim_creative_job_v1',{p_id:id,p_worker_id:'shiye-compute-01'});
        if(job?.status==='running'&&job.lease_token)return job;
        if(job?.id){retryUntil.delete(id);await notify(id).catch(()=>{});}
        else{
          const pending=await lookup(id);
          if(pending?.status==='running')later(id,Date.parse(pending.lease_until)-Date.now()+100);
        }
        return {};
      }catch(error){later(id,15000);throw error;}
    },
    process:async(job,daemon)=>{
      const controller=new AbortController();let settled;const done=new Promise(resolve=>{settled=resolve;});active.set(job.id,{controller,done});
      try{const result=await runCloudCreativeJob(job,{store,rpc,listCheckpoints,model,notify,daemon,signal:controller.signal});
        logger.log('Creative completed',job.id,'milliseconds',result.totalMs);
      }catch(error){logger.error('Creative failed',job.id,error.code||'CREATIVE_FAILED');if(error.creativeRetry)later(job.id,5000);}
      finally{active.delete(job.id);if(!timers.has(job.id))retryUntil.delete(job.id);settled();}
    }
  });
  return {
    hint(id){if(!closed)lanes.hint(id);},
    async cancelHint(id){
      if(!active.has(id))return;
      const job=await lookup(id);
      if(job?.status==='cancelled')active.get(id)?.controller.abort(Error('用户已取消创作'));
    },
    recover(){
      if(closed)return Promise.resolve();
      if(recovering)return recovering;
      recovering=(async()=>{for(const job of await listActive())lanes.hint(job.id);})().finally(()=>{recovering=null;});
      return recovering;
    },
    async close(){closed=true;for(const timer of timers.values())clearTimeout(timer);timers.clear();
      for(const {controller} of active.values())controller.abort(Object.assign(Error('计算服务器正在重启'),{code:'CREATIVE_WORKER_STOPPED'}));
      await Promise.allSettled([...active.values()].map(run=>run.done));
      for(const daemon of daemons)daemon.stop();await network.close();}
  };
}

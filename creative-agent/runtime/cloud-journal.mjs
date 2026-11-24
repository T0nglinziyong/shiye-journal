import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {boundedMap} from '../../src/bounded-map.js';

export const creativeObjectHash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export function creativeJobPrefix(job){
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(job.user_id||'')||!/^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(job.id||''))throw Error('创作任务身份无效');
  return `${job.user_id}/creative/${job.id}/`;
}
export function cloudCheckpointJournal({job,store,rpc,list}){
  const prefix=creativeJobPrefix(job);let sequence=job.checkpoint_seq;
  if(!Number.isInteger(sequence)||sequence<0||sequence>512||!job.lease_token)throw Error('创作检查点序号或租约无效');
  return {
    async read(){
      const rows=await list(job.id);
      if(rows.length!==sequence||rows.some((row,i)=>row.job_id!==job.id||row.seq!==i+1))throw Error('云端创作检查点不连续');
      return boundedMap(rows,4,async row=>{
        if(!/^sha256:[a-f0-9]{64}$/.test(row.object_hash)||row.object_path!==prefix+'checkpoints/'+row.object_hash.slice(7)+'.json.gz')throw Error('云端检查点不属于本次任务');
        const bytes=await store.download(row.object_path);
        if(bytes.length>10*1024*1024||creativeObjectHash(bytes)!==row.object_hash)throw Error('云端检查点校验失败');
        return JSON.parse(gunzipSync(bytes,{maxOutputLength:64*1024*1024}).toString('utf8'));
      });
    },
    async append(entry){
      const bytes=gzipSync(Buffer.from(JSON.stringify(entry))),hash=creativeObjectHash(bytes),path=prefix+'checkpoints/'+hash.slice(7)+'.json.gz';
      if(bytes.length>10*1024*1024||sequence>=512)throw Object.assign(Error('创作检查点超过限制'),{code:'CREATIVE_CHECKPOINT_SIZE'});
      await store.upload(path,bytes,'application/gzip');
      const result=await rpc('shiye_append_creative_checkpoint_v1',{p_id:job.id,p_lease:job.lease_token,p_seq:sequence+1,p_path:path,p_hash:hash});
      if(result?.seq!==sequence+1)throw Error('创作检查点未确认');
      sequence++;
    }
  };
}

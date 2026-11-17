// Compute inputs and masks are scratch data. Material images live in a separate
// storage namespace and are never considered by this collector.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const owner=/^\d{10,22}$/;
export const COMPUTE_RETENTION_HOURS=0;

export function computeObjectNames(job,manifest){
  if(!uuid.test(job?.id||'')||!owner.test(job?.user_id||'')||
    !['completed','failed'].includes(job?.status))throw Error('Invalid terminal compute job');
  const prefix=`${job.user_id}/compute/${job.id}/`;
  if(job.input_path!==prefix+'input.png'||
    (job.result_path!=null&&job.result_path!==prefix+'result.json'))
    throw Error('Compute job path does not match owner');
  const names=[prefix+'input.png'];
  if(job.result_path){
    if(!manifest||![1,2].includes(manifest.version)||!Array.isArray(manifest.objects)||
      manifest.objects.length>250)throw Error('Compute result manifest is invalid');
    if(manifest.version===1){
      for(const item of manifest.objects){
        if(!/^material-\d{3}\.png$/.test(item?.file||''))throw Error('Invalid mask name');
        names.push(prefix+item.file);
      }
    }
    names.push(prefix+'result.json');
  }
  return [...new Set(names)];
}

export async function sweepComputeJobs({list,readManifest,removeObject,removeJob,now=Date.now(),
  retentionHours=COMPUTE_RETENTION_HOURS}={}){
  if(!Number.isFinite(now)||retentionHours<0||retentionHours>24)throw Error('Invalid retention');
  const cutoff=new Date(now-retentionHours*3600_000).toISOString();
  const jobs=await list(cutoff,40);
  if(!Array.isArray(jobs)||jobs.length>40)throw Error('Invalid cleanup candidates');
  let deleted=0,failed=0;
  for(const job of jobs){
    try{
      if(!Number.isFinite(Date.parse(job.updated_at))||Date.parse(job.updated_at)>=Date.parse(cutoff))
        throw Error('Job is not past retention');
      const manifest=job.result_path?await readManifest(job.result_path):null;
      const names=computeObjectNames(job,manifest);
      for(const name of names)await removeObject(name);
      // The conditional delete rechecks terminal status and cutoff. Missing
      // objects are harmless on retry after a partial cleanup.
      if(await removeJob(job.id,cutoff))deleted++;
    }catch(error){failed++;console.warn('Compute retention skipped job',job?.id,error.message);}
  }
  return {deleted,failed,scanned:jobs.length,more:jobs.length===40,cutoff};
}

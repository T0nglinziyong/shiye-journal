export async function sweepCreativeArtifacts({rpc,removeObject,apply=false}){
  let scanned=0,deleted=0;
  for(let batch=0;batch<100;batch++){
    const result=await rpc('shiye_creative_cleanup_plan_v1',{p_limit:200});
    if(!Array.isArray(result?.names)||result.names.length>200)throw Error('创作清理计划无效');
    for(const name of result.names){
      if(!/^\d{10,22}\/creative\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\/(?:input\.json|(?:assets|previews|results|checkpoints|cuts)\/[a-zA-Z0-9_-]+\.(?:png|json|json\.gz))$/.test(name))throw Error('创作清理路径无效');
    }
    scanned+=result.names.length;
    if(!apply)break;
    for(let offset=0;offset<result.names.length;offset+=4){
      await Promise.all(result.names.slice(offset,offset+4).map(async name=>{await removeObject(name);deleted++;}));
    }
    if(result.names.length<200)break;
  }
  return {scanned,deleted,mode:apply?'apply':'dry-run'};
}

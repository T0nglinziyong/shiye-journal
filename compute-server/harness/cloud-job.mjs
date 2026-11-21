import {createCreativeHarness,initialHarnessState} from './agent.mjs';
import {loadCreationSkills} from './skills.mjs';
import {JournalCheckpointSaver} from './checkpoints.mjs';
import {cloudCheckpointJournal,creativeJobPrefix,creativeObjectHash} from './cloud-journal.mjs';
import {createHarnessRenderer} from './renderer.mjs';
import {createMaterialSegmenter} from './segmentation.mjs';
import {localGlyphOutline} from '../../src/creation-font-resolver.mjs';
import {validateCreativeJobPackage} from '../../src/creative-job-package.js';
import {installedCreationResources,requireResourceVersion} from './resources.mjs';
import {loadCreativeMaterialImages} from './material-images.mjs';
import {summarizeCreativeEvaluation} from './quality-evaluation.mjs';

export async function runCloudCreativeJob(job,{store,rpc,listCheckpoints,lookupRecords,model,notify,daemon,signal,clock=Date.now}){
  const prefix=creativeJobPrefix(job),startedAt=Date.parse(job.created_at),deadlineAt=Date.parse(job.deadline_at),controller=new AbortController();
  if(job.input_path!==prefix+'input.json'||!Number.isFinite(startedAt)||!Number.isFinite(deadlineAt)||deadlineAt-startedAt>600000)throw Error('创作任务输入或时限无效');
  const cancel=()=>controller.abort(signal.reason||Error('创作执行已停止'));signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const remaining=Math.max(1,deadlineAt-clock()-5000);
  const timeout=setTimeout(()=>controller.abort(Object.assign(Error('创作达到时限'),{code:'CREATIVE_DEADLINE'})),remaining);
  let heartbeatBusy=false,progress={stage:'loading',turn:0},notifiedAt=0;
  const update=async extra=>{
    controller.signal.throwIfAborted();
    const state=await rpc('shiye_update_creative_job_v1',{p_id:job.id,p_lease:job.lease_token,...extra});
    if(state?.status!=='running'&&!(extra.p_result_path&&state?.status==='completed'))throw Error('创作任务已停止');
    return state;
  };
  const ping=async(force=false)=>{
    if(force||clock()-notifiedAt>=3000){notifiedAt=clock();try{await notify(job.id);}catch{/* Reconnect reads the durable state. */}}
  };
  const heartbeat=setInterval(async()=>{
    if(heartbeatBusy||controller.signal.aborted)return;heartbeatBusy=true;
    try{await update({});}catch(error){controller.abort(error);}finally{heartbeatBusy=false;}
  },30000);
  try{
    const inputBytes=await store.download(job.input_path);
    if(creativeObjectHash(inputBytes)!==job.input_hash)throw Error('创作输入已被修改，未继续执行');
    const input=validateCreativeJobPackage(JSON.parse(inputBytes.toString('utf8')));
    const resources=await installedCreationResources();
    requireResourceVersion(input.brief.resourceVersion,resources.version);
    progress={...progress,resourceVersion:resources.version};
    const {images,hashes}=await loadCreativeMaterialImages(input.document.source,{owner:job.user_id,store,lookupRecords,signal:controller.signal});
    controller.signal.throwIfAborted();
    const skills=await loadCreationSkills(),checkpointer=await new JournalCheckpointSaver(cloudCheckpointJournal({job,store,rpc,list:listCheckpoints})).restore();
    const renderer=await createHarnessRenderer({source:input.document.source,images,saveArtifact:async({png,pngHash,document,report})=>{
      const pngPath=prefix+'previews/'+pngHash.slice(7)+'.png',documentBytes=Buffer.from(JSON.stringify(document));
      const documentPath=prefix+'previews/'+creativeObjectHash(documentBytes).slice(7)+'.json';
      await Promise.all([store.upload(pngPath,png,'image/png'),store.upload(documentPath,documentBytes,'application/json')]);
      progress={...progress,stage:'preview',previewPath:pngPath,documentPath,renderer:report.rendererBackend};
      await update({p_progress:progress});await ping(true);return pngPath;
    }});
    const segmentMaterial=daemon?await createMaterialSegmenter({source:input.document.source,images,
      imageHashes:hashes,daemon,saveArtifact:async({proposal,png})=>{
        const path=prefix+'cuts/'+proposal.id+'.png';await store.upload(path,png,'image/png');return path;
      }}):undefined;
    const harness=createCreativeHarness({...renderer,skills,checkpointer,model,segmentMaterial,clock,
      capabilities:{glyphOutline:localGlyphOutline},onProgress:async event=>{
        progress={...progress,...event};await update({p_progress:progress});await ping();
      }});
    const saved=job.checkpoint_seq?await harness.state(job.id):null;
    if(job.checkpoint_seq&&(!saved||saved.document.source.taskHash!==input.document.source.taskHash||saved.startedAt!==startedAt))throw Error('创作检查点与原始任务不一致');
    if(saved)requireResourceVersion(saved.resources.release,resources.version);
    const state=saved?undefined:initialHarnessState({document:input.document,skills,brief:input.brief,
      tray:await renderer.index(input.document,controller.signal),startedAt,deadlineAt:deadlineAt-10000,resourceVersion:resources.version});
    const result=await harness.run({id:job.id,state,signal:controller.signal});
    controller.signal.throwIfAborted();
    if(result.status!=='completed')throw Error('创作未完成');
    const bytes=Buffer.from(JSON.stringify(result.document)),path=prefix+'results/'+creativeObjectHash(bytes).slice(7)+'.json';
    const evaluation=summarizeCreativeEvaluation(result.qualityFrames||[]);
    await Promise.all([
      store.upload(path,bytes,'application/json'),
      store.upload(prefix+'reports/evaluation.json',Buffer.from(JSON.stringify(evaluation)),'application/json'),
      store.upload(prefix+'reports/trace.json',Buffer.from(JSON.stringify(result.trace||[])),'application/json')
    ]);
    await update({p_result_path:path,p_progress:{...progress,stage:'completed',totalMs:clock()-startedAt,turns:result.turns}});
    await ping(true);return {id:job.id,resultPath:path,totalMs:clock()-startedAt};
  }catch(error){
    if(controller.signal.reason?.code==='CREATIVE_WORKER_STOPPED')error=controller.signal.reason;
    const retryable=error.code==='CREATIVE_WORKER_STOPPED'||error instanceof TypeError&&error.message==='fetch failed'||[408,429,500,502,503,504].includes(error.status);
    try{
      if(retryable){const released=await rpc('shiye_release_creative_job_v1',{p_id:job.id,p_lease:job.lease_token});error.creativeRetry=released?.status==='queued';}
      else await rpc('shiye_update_creative_job_v1',{p_id:job.id,p_lease:job.lease_token,p_error_code:['CREATIVE_DEADLINE','CREATIVE_RESOURCE_VERSION'].includes(error.code)?error.code:'CREATIVE_FAILED'});
      await ping(true);
    }catch{/* Cancelled or fenced workers cannot publish a result. */}
    throw error;
  }finally{clearInterval(heartbeat);clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
}

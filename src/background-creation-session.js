import {createCreationDocument} from './creation-document.js';
import {creativeRunParameters} from './ai-creation-session.js';
import {createCloudCreativeJobs,watchCloudCreativeJob} from './cloud-creative-jobs.js';
import {commitAIDraft} from './ai-run-target.js';
import {importWebScene} from './web-scene-workbench.js';
import {boundedMap} from './bounded-map.js';

const phases={queued:'已提交，等待计算服务器',loading:'正在读取素材',thinking:'正在构思与编辑',preview:'正在检查实际画面',completed:'创作完成',failed:'创作未完成，已保留后台检查点',cancelled:'已停止创作'};
export function creativeJobProgress(job){
  if(job.error_code==='CREATIVE_RESOURCE_VERSION')return '创作资源正在更新，请更新拾页后重试；原稿已保留';
  const stage=['completed','failed','cancelled','queued'].includes(job.status)?job.status:job.progress?.stage||'loading';
  return (phases[stage]||'后台创作中')+(job.progress?.turn?' · 第 '+job.progress.turn+' 轮':'');
}

export async function applyBackgroundCreativeResult({project,document,job,assets,persist}){
  const saved=project.creativeCompletedJobs?.[job.id];
  if(saved){await persist(project);return {project,draft:project.drafts.find(d=>d.id===saved),duplicate:true};}
  if(project.id!==job.project_id)throw Error('创作结果不属于当前作品');
  if(project.creativeTask?.id===job.id&&project.creativeTask.taskHash!==document.source.taskHash)throw Error('创作结果与提交任务不一致');
  const imported=importWebScene(document,assets),generated=imported.drafts[0];
  generated.agentRun={status:'finished',visualReview:'model-reviewed',jobID:job.id};
  {
    const base=document.source.baseDraft,target=project.drafts.find(d=>d.id===base.id);
    let result;
    if(target){
      // A later task on the same project also makes this an independent candidate.
      result=commitAIDraft(project,{targetDraftID:base.id,expectedDraft:project.creativeTask?.id===job.id?base:null,generatedDraft:generated,newDraftID:job.id});
    }else{
      const candidate={...generated,id:job.id,title:(generated.title||'方案')+' · AI 候选'};
      project.drafts.push(candidate);result={targetDraftID:candidate.id,candidate:true};
    }
    project.creativeCompletedJobs={...project.creativeCompletedJobs,[job.id]:result.targetDraftID};
    if(project.creativeTask?.id===job.id)project.creativeTask={...project.creativeTask,status:'completed'};
    project.aiGenerated=true;project.deliveryMode='tools';await persist(project);
    return {...result,project,draft:project.drafts.find(d=>d.id===result.targetDraftID)};
  }
}

export function createBackgroundCreationSession({getAccount,getAssets,getProject,persist,createImage,api=createCloudCreativeJobs(),watch=watchCloudCreativeJob,onUpdate=()=>{}}){
  const runs=new Map(),previews=new Map();
  const ensure=owner=>{if(getAccount()!==owner)throw Error('账号已切换，后台任务继续保留在原账号');};
  const observe=async(projectID,id,owner,listener)=>{
    ensure(owner);
    let run=runs.get(id);
    if(run){if(listener)run.listeners.add(listener);return run.promise;}
    let resolve,reject;
    run={owner,listeners:new Set(listener?[listener]:[]),promise:new Promise((yes,no)=>{resolve=yes;reject=no;}),stop:()=>{},reject};
    runs.set(id,run);
    const emit=event=>{ensure(owner);const value={jobID:id,projectID,...event};onUpdate(value);for(const fn of run.listeners)fn(value);};
    let ended=false;
    const end=(error,result)=>{if(ended)return;ended=true;run.stop();runs.delete(id);error?reject(error):resolve(result);};
    run.stop=watch(api,id,{
      onStatus:job=>{
        try{emit({job,status:job.status,message:creativeJobProgress(job)});
          if(['failed','cancelled'].includes(job.status))end(Object.assign(Error(creativeJobProgress(job)),{code:job.error_code||'CREATIVE_CANCELLED'}));
        }catch(error){end(error);}
      },
      onDocument:async(document,job)=>{
        ensure(owner);
        let previewURL=previews.get(projectID)?.url;
        if(api.preview&&job.progress?.previewPath!==previews.get(projectID)?.path){
          const blob=await api.preview(job);ensure(owner);previewURL=URL.createObjectURL(blob);
          if(previews.has(projectID))URL.revokeObjectURL(previews.get(projectID).url);
          previews.set(projectID,{path:job.progress.previewPath,url:previewURL});
        }
        if(job.status!=='completed'){emit({job,status:job.status,document,previewURL,message:creativeJobProgress(job)});return;}
        try{
          const project=await getProject(projectID);ensure(owner);
          if(!project)throw Error('原作品已删除；后台结果仍保留，未恢复已删除作品');
          const result=await applyBackgroundCreativeResult({project,document,job,assets:getAssets(),persist:async p=>{ensure(owner);await persist(p);}});
          emit({job,status:'completed',document,previewURL,project:result.project,message:result.candidate?'已另存 AI 候选，原稿修改已保留':'创作完成，草稿已保存'});end(null,{...result,jobID:id});
        }catch(error){emit({status:'result-unapplied',message:error.message});end(error);}
      },
      onError:error=>{try{emit({status:'disconnected',message:'连接暂不可用，后台继续创作；恢复连接后补同步'});}catch(accountError){end(accountError);}}
    });
    return run.promise;
  };
  return {
    async generate({project,draft,assets,ids,prompt,onProgress,signal}){
      const owner=getAccount(),guard=()=>{ensure(owner);signal?.throwIfAborted();};let reference;
      try{
      guard();
      const parameters=creativeRunParameters({project,draft,assets,ids,prompt,settings:{}}),document=await createCreationDocument(parameters);
      const images=await boundedMap(document.source.materials,4,async m=>{
        guard();const asset=assets.find(a=>a.id===m.assetID),data=await createImage(asset,null,1280,true);
        if(!/^data:image\/png;base64,/.test(data||''))throw Error('创作素材预览未生成');
        return {alias:m.alias,blob:await (await fetch(data)).blob()};
      });guard();
      reference=await api.prepare({projectID:project.id,document,images,brief:{intent:prompt,styles:parameters.styles,purposes:parameters.pagePurposes,contentPolicy:parameters.contentPolicy}});
      guard();project.creativeTask={id:reference.id,taskHash:document.source.taskHash,targetDraftID:draft.id,status:'uploading'};
      await persist(project);await onProgress?.({jobID:reference.id,projectID:project.id,status:'uploading',message:'正在上传创作输入，完成后可锁屏'});
      guard();await api.submit(reference);guard();
      project.creativeTask.status='queued';await persist(project);
      return observe(project.id,reference.id,owner,onProgress);
      }catch(error){if(reference&&signal?.aborted&&getAccount()===owner)await api.cancel(reference.id);throw error;}
    },
    async resume(project,onProgress){
      const owner=getAccount(),id=project.creativeTask?.id;if(!id)return null;
      const pending=(await api.pending()).find(p=>p.id===id);if(pending)await api.submit(pending);ensure(owner);
      return observe(project.id,id,owner,onProgress);
    },
    async recover(){
      const owner=getAccount();
      for(const pending of await api.pending()){ensure(owner);try{await api.submit(pending);}catch{/* Keep the durable upload for the next reconnect. */}}
      for(const job of await api.recent()){
        ensure(owner);const project=await getProject(job.project_id);ensure(owner);
        if(!project||project.creativeCompletedJobs?.[job.id]||!['queued','running','completed'].includes(job.status))continue;
        void observe(project.id,job.id,owner).catch(error=>onUpdate({projectID:project.id,jobID:job.id,status:'result-unapplied',message:error.message}));
      }
    },
    previewURL:projectID=>previews.get(projectID)?.url||null,
    cancel:id=>api.cancel(id),
    dispose(){for(const run of runs.values()){run.stop();run.reject(Error('账号已切换，后台任务仍保留'));}runs.clear();for(const {url} of previews.values())URL.revokeObjectURL(url);previews.clear();}
  };
}

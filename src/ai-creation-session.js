import {assetSourceRevision} from './material-anatomy.js';
import {materialAliases} from './material-alias.js';
import {prepareMaterialPreviews} from './creative-previews.js';
import {commitAIDraft} from './ai-run-target.js';

export function creativeRunParameters({project,draft,assets,ids,settings,prompt}){
  return {...settings,draft,assets,aliases:materialAliases(ids),
    styles:project.styles||[draft.style],
    pagePurposes:project.purposes||[project.purpose||'自由创作'],
    contentPolicy:project.contentPolicy||'original',
    textPresentation:project.textPresentation||'mixed',
    userText:project.userText||'',providedFacts:project.providedFacts||'',
    requiredAssetIDs:project.requiredAssetIDs||[],materialPriority:project.materialPriority,
    processing:project.processing||'自由拆解',prompt};
}

export function createCreativeRunGuard({accountID,ids,assets,getAccount,getAsset,signal}){
  const revisions=new Map(ids.map(id=>[id,assetSourceRevision(assets.find(a=>a.id===id))]));
  return ()=>{
    if(signal.aborted)throw signal.reason||Error('创作已停止');
    if(getAccount()!==accountID)throw Error('账号已变化，未把生成内容保存到另一个账号');
    for(const [id,revision] of revisions){
      const current=getAsset(id);
      if(!current||assetSourceRevision(current)!==revision)throw Error('创作期间素材来源或标定已变化；已停止提交旧条件的结果');
    }
  };
}

export async function prepareCreativeRunInputs({assets,ids,settings,createImage,guard}){
  const vision=settings.supportsVision;
  const findAsset=id=>assets.find(a=>a.id===id);
  const images=vision?await prepareMaterialPreviews(ids,{findAsset,createImage:async(...args)=>{
    guard();return createImage(...args);
  }}):[];
  guard();
  return {images};
}

export const creativeProgressText=progress=>'请求 '+progress.budget.totalRequests+'/'+progress.budget.limit+
  '（创作 '+progress.budget.creationRequests+'、格式修复 '+progress.budget.formatRepairRequests+'） · '+
  progress.phase+' · '+progress.seconds+' 秒 · 已接收 '+progress.received+' 字符';

export const hasCreativeSceneChange=results=>results.some(r=>r.ok&&r.name!=='inspect_materials');

export function createCreativeCheckpoint({getProject,targetDraftID,expectedDraft,newDraftID,persist}){
  let currentID=targetDraftID,expected=structuredClone(expectedDraft),candidateCreated=false;
  return {
    async commit(generatedDraft){
      const project=getProject();
      if(!project)throw Error('原创作作品已不存在；结果未覆盖其他作品');
      const result=commitAIDraft(project,{targetDraftID:currentID,expectedDraft:expected,generatedDraft,newDraftID:newDraftID()});
      currentID=result.targetDraftID;expected=result.expectedDraft;candidateCreated||=result.candidate;
      await persist(project,result);
      return result;
    },
    get targetDraftID(){return currentID;},
    get candidateCreated(){return candidateCreated;}
  };
}

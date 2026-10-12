import {attachSceneV2} from './scene-v2.js';
// A model turn is based on one draft snapshot. Never assign it to whatever
// draft happens to be active when an asynchronous response arrives.
export function commitAIDraft(project,{targetDraftID,expectedDraft,generatedDraft,newDraftID}){
  const index=project.drafts.findIndex(d=>d.id===targetDraftID);
  if(index<0)throw Error('原创作草稿已不存在；未覆盖其他草稿');
  const unchanged=JSON.stringify(project.drafts[index])===JSON.stringify(expectedDraft);
  if(unchanged){
    const saved=attachSceneV2(structuredClone(generatedDraft));saved.id=targetDraftID;
    project.drafts[index]=saved;
    return {targetDraftID,expectedDraft:structuredClone(saved),candidate:false};
  }
  const saved=attachSceneV2(structuredClone(generatedDraft));saved.id=newDraftID; saved.title=(saved.title||'方案')+' · AI 候选';
  project.drafts.push(saved);
  return {targetDraftID:newDraftID,expectedDraft:structuredClone(saved),candidate:true};
}

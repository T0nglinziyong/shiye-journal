import {craftSceneHash} from './craft-fingerprint.js';
import {AI_SCENE_POLICY,requireScenePolicy} from './scene-edit-policy.js';
import {validateScenePhysical} from './creative.js';
import {sceneStructureTransaction} from './scene-structure-edit.js';
import {attachSceneV2} from './scene-v2.js';

const sessions=new WeakSet();
const copy=draft=>attachSceneV2(structuredClone(draft));

// Object editing and scissors share one isolated Scene transaction. Only
// finish copies its layers into the saved project; discard never reaches sync.
export function beginSceneEditSession(draft,{projectID,saveRevision,selectedID=null}){
  const working=copy(draft);
  const session={projectID,draftID:draft.id,saveRevision,baseSceneHash:craftSceneHash(draft),working,revision:0,
    steps:[{layers:structuredClone(working.layers),selectedID}],index:0};
  sessions.add(session);return session;
}

export function acceptSceneEditStep(session,draft,selectedID){
  if(draft.id!==session.draftID)throw Error('剪刀会话的画面已变化');
  session.steps.splice(session.index+1);
  session.steps.push({layers:structuredClone(draft.layers),selectedID});
  if(session.steps.length>41){session.steps.splice(1,session.steps.length-41);}
  session.index=session.steps.length-1;
  // Inspector changes already mutate the staged draft. Re-cloning it on
  // every slider event doubled the cost for large pages.
  session.working=draft===session.working?draft:copy(draft);
  session.revision++;
  return session;
}

export function stepSceneEditSession(session,direction){
  const next=session.index+(direction==='undo'?-1:direction==='redo'?1:0);
  if(next<0||next>=session.steps.length)return null;
  session.index=next;
  session.working.layers=structuredClone(session.steps[next].layers);
  session.revision++;
  return session.steps[next].selectedID;
}

export function sceneEditSessionChanged(session){
  return !!session&&JSON.stringify(session.steps[0].layers)!==
    JSON.stringify(session.working.layers);
}

// Only a live host-created session may commit. The original hash prevents a
// stale inspector/scissors window from overwriting intervening edits.
export function commitSceneEditSession(page,session,assets,{policy=AI_SCENE_POLICY}={}){
 requireScenePolicy(policy);
 if(!policy.takeover)throw Object.assign(Error('暂存会话只能由用户主动提交；AI 必须使用受校验的 Commands'),{code:'EDIT_POLICY_DENIED'});
 if(!sessions.has(session)||page.id!==session.draftID)throw Error('编辑会话无效');
 if(craftSceneHash(page)!==session.baseSceneHash)throw Error('作品已变化，不能提交过期编辑会话');
 validateScenePhysical(session.working,assets);
 const result=sceneStructureTransaction(page,()=>{page.layers=structuredClone(session.working.layers);
  for(const key of ['craftLedger','craftScraps','craftReceipts'])if(Object.hasOwn(session.working,key))page[key]=structuredClone(session.working[key]);else delete page[key];
  return true;},{policy});
 sessions.delete(session);return result;
}

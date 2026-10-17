import {attachSceneV2} from './scene-v2.js';

const copy=draft=>attachSceneV2(structuredClone(draft));

// Object editing and scissors share one isolated Scene transaction. Only
// finish copies its layers into the saved project; discard never reaches sync.
export function beginSceneEditSession(draft,{projectID,saveRevision,selectedID=null}){
  const working=copy(draft);
  return {projectID,draftID:draft.id,saveRevision,working,revision:0,
    steps:[{layers:structuredClone(working.layers),selectedID}],index:0};
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

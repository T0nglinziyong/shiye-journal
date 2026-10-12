import {snapshotDraft} from './draft-snapshot.js';
import {createSceneTransition,hasSceneChanges,applySceneTransition} from './scene-history-delta.js';

export function editorHistoryIdentity(state){
  return state.activeProject?.id && state.activeDraft
    ? `${state.accountId||'browser'}:${state.activeProject.id}:${state.activeDraft}` : null;
}
export function resetEditorHistory(state){
  state.undo=[];
  state.redo=[];
  state.editorHistoryScope=editorHistoryIdentity(state);
}
export function ensureEditorHistory(state){
  const identity=editorHistoryIdentity(state);
  if(state.editorHistoryScope!==identity)resetEditorHistory(state);
  return identity;
}
export function checkpointEditorHistory(state,draft,{limit=40}={}){
  if(!draft||!ensureEditorHistory(state))return;
  const pending=state.undo.at(-1);
  if(pending?.kind==='scene-pending-v2'){
    state.undo.pop();
    const transaction=createSceneTransition(pending.before,draft);
    if(hasSceneChanges(transaction))state.undo.push(transaction);
  }
  state.undo.push({kind:'scene-pending-v2',draftID:draft.id,before:snapshotDraft(draft)});
  if(state.undo.length>limit)state.undo.shift();
  state.redo=[];
}
export function takeEditorHistoryStep(state,from,to,draft){
  if(!draft||!ensureEditorHistory(state))return null;
  const entry=state[from].at(-1);
  if(!entry)return null;
  if(entry.draftID!==draft.id){resetEditorHistory(state);return null;}
  const transaction=entry.kind==='scene-pending-v2'?createSceneTransition(entry.before,draft):entry;
  state[from].pop();
  if(!hasSceneChanges(transaction))return null;
  const restored=applySceneTransition(draft,transaction,from==='undo'?'before':'after');
  state[to].push(transaction);
  return restored;
}

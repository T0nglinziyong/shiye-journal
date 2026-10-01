import {snapshotDraft} from './draft-snapshot.js';

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

export function takeEditorHistoryStep(state,from,to,draft){
  if(!draft||!ensureEditorHistory(state))return null;
  const previous=state[from].at(-1);
  if(!previous)return null;
  // A stale snapshot from another draft must never replace the active draft,
  // even if a caller forgot to reset its toolbar's history arrays.
  if(previous.id!==draft.id){resetEditorHistory(state);return null;}
  state[from].pop();
  state[to].push(snapshotDraft(draft));
  return previous;
}

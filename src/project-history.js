// Titles are persisted separately from visual styles; old projects migrate on
// their next ordinary save, without mutating the initial artwork.
import {snapshotDraft} from './draft-snapshot.js';
export function captureHistory(project){
  let changed=false;
  if(!project.initialEditorSnapshot){project.initialEditorSnapshot={drafts:project.drafts.map(snapshotDraft),activeDraftID:project.activeDraftID};changed=true;}
  project.draftHistorySnapshots||={};
  for(const draft of project.drafts)if(!project.draftHistorySnapshots[draft.id]){
    const initial=project.initialEditorSnapshot.drafts?.find(d=>d.id===draft.id);
    project.draftHistorySnapshots[draft.id]=snapshotDraft(initial||draft);changed=true;
  }
  return changed;
}
export function restoreHistoryDraft(project,id){
  const saved=project.draftHistorySnapshots?.[id];
  const target=project.drafts.find(d=>d.id===id);
  if(!saved||!target)throw Error('此版本的快照不存在，当前作品未改变');
  const restored=snapshotDraft(saved);
  // A rename changes the history label, not its saved artwork.
  if(target.title)restored.title=target.title;
  project.drafts[project.drafts.indexOf(target)]=restored;
  project.activeDraftID=id;return restored;
}
export function historyTitle(entry,index=0){return entry.title?.trim()||(index===0?'最初方案':'方案 '+(index+1));}
export function renameHistory(entry,title){const value=String(title??'').trim();if(!value)throw Error('名称不能为空');entry.title=value.slice(0,80);}
export function deleteDraft(project,id){
  if(project.drafts.length<=1)throw Error('至少保留一个方案');
  const index=project.drafts.findIndex(d=>d.id===id);if(index<0)return;
  project.drafts.splice(index,1);
  if(project.draftHistorySnapshots)delete project.draftHistorySnapshots[id];
  if(project.activeDraftID===id)project.activeDraftID=project.drafts[Math.min(index,project.drafts.length-1)].id;
}

import {snapshotDraft} from './draft-snapshot.js';
import {attachSceneV2} from './scene-v2.js';
export function captureHistory(project){
  if(!project.initialEditorSnapshot||!project.draftHistorySnapshots)throw Error('作品缺少当前版本历史结构');
  let changed=false;
  for(const draft of project.drafts)if(!project.draftHistorySnapshots[draft.id]){
    project.draftHistorySnapshots[draft.id]=snapshotDraft(draft);changed=true;
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
export function historyTitle(entry,index=0){return entry.title?.trim()||(index===0?'最初版本':'历史版本 '+(index+1));}
export function renameHistory(entry,title){const value=String(title??'').trim();if(!value)throw Error('名称不能为空');entry.title=value.slice(0,80);}
export function deleteDraft(project,id){
  if(project.drafts.length<=1)throw Error('至少保留一个历史版本');
  const index=project.drafts.findIndex(d=>d.id===id);if(index<0)return;
  project.drafts.splice(index,1);
  if(project.draftHistorySnapshots)delete project.draftHistorySnapshots[id];
  if(project.activeDraftID===id)project.activeDraftID=project.drafts[Math.min(index,project.drafts.length-1)].id;
}

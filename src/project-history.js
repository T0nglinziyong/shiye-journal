// Titles are persisted separately from visual styles; old projects migrate on
// their next ordinary save, without mutating the initial artwork.
export function historyTitle(entry,index=0){return entry.title?.trim()||(index===0?'最初方案':'方案 '+(index+1));}
export function renameHistory(entry,title){const value=String(title??'').trim();if(!value)throw Error('名称不能为空');entry.title=value.slice(0,80);}
export function deleteDraft(project,id){
  if(project.drafts.length<=1)throw Error('至少保留一个方案');
  const index=project.drafts.findIndex(d=>d.id===id);if(index<0)return;
  project.drafts.splice(index,1);
  if(project.activeDraftID===id)project.activeDraftID=project.drafts[Math.min(index,project.drafts.length-1)].id;
}

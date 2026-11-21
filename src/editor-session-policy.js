// A read-only editor visit must not generate scene snapshots or uploads.
// Compare local *save intents*, not timestamp or remote updatedAt, because a
// separate device can update a project while this editor is being viewed.
export function newEditorSession(project,versions){
  return project?.id?Object.freeze({id:project.id,version:versions.get(project.id)||0}):null;
}
export function editorSessionHasEdits(project,session,versions){
  return !!(project&&session&&project.id===session.id&&
    (versions.get(project.id)||0)>session.version);
}

// Exit policy is independent of route history. New drafts stay drafts on
// Back; Complete publishes them. Already-published works never become drafts.
export function editorExitDecision(project,action){
  if(!project||!['back-works','editor-done'].includes(action))throw Error('未知的创作退出方式');
  const isDraft=action==='editor-done'?false:project.isDraft===true;
  return {isDraft,tab:isDraft?'draft':'all',publish:action==='editor-done'};
}

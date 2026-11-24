export function isBlankEditableProject(project){
  return project?.isDraft===true&&project.isSnapshot!==true&&Array.isArray(project.drafts)&&
    project.drafts.length>0&&project.drafts.every(draft=>
      ['layers','items','strokes','textBlocks','shapes'].every(key=>!draft[key]?.length));
}

// A genuinely untouched page has no useful draft to return to.
export function editorExitDecision(project,action){
  if(!project||!['back-works','editor-done'].includes(action))throw Error('未知的创作退出方式');
  if(isBlankEditableProject(project))return {isDraft:false,tab:'all',publish:false,discard:true};
  const isDraft=action==='editor-done'?false:project.isDraft===true;
  return {isDraft,tab:isDraft?'draft':'all',publish:action==='editor-done',discard:false};
}

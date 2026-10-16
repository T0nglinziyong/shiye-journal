// Current Scene v2 material nodes carry a library ID. Keep this index in the
// project summary so a remote save can verify newly added source materials
// without downloading every older project document.
export function sceneMaterialIDs(project){
  const ids=new Set();
  const visit=nodes=>{
    for(const node of nodes||[]){
      if(node?.type==='material'&&typeof node.assetID==='string'&&node.assetID)ids.add(node.assetID);
      if(node?.type==='group')visit(node.children);
    }
  };
  for(const draft of project?.drafts||[])visit(draft?.layers);
  return [...ids].sort();
}

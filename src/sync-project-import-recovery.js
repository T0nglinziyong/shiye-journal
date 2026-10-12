// Recover editable Scene v2 projects staged through the old generic import
// queue. Only a single current-format project PUT can be forked safely.
export function forkConflictingEditableImport(batch,{newBatchId,newProjectId,now,validateProject}={}){
 if(!batch||!Array.isArray(batch.operations)||batch.operations.length!==1)return null;
 const operation=batch.operations[0];
 if(operation?.store!=='projects'||operation.action!=='put')return null;
 const original=operation.item;
 if(!original||original.isSnapshot||!validateProject(original))return null;
 if(typeof newBatchId!=='string'||!newBatchId||typeof newProjectId!=='string'||!newProjectId||original.id===newProjectId)return null;
 const copy=structuredClone(original),previousId=copy.id;
 copy.id=newProjectId;
 copy.title=String(copy.title||'未命名作品').slice(0,64)+' · 待核对的同步副本';
 copy.updatedAt=now||new Date().toISOString();
 copy.conflictSourceID=previousId;
 for(const field of ['projectDocumentPath','projectDocumentProvider','projectDocumentEncoding',
   'coverStaticPath','coverBaselineUpdatedAt','__cloudBaseRevision','__cloudSessionId'])delete copy[field];
 return {...structuredClone(batch),id:newBatchId,names:['projects'],operations:[{store:'projects',action:'put',item:copy}]};
}

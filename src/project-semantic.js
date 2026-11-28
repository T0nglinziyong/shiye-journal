import {canonicalTaskSource} from './task-source.js';

// These fields describe the editor session, recovery bookkeeping or a derived
// cover. None is a user edit to the work itself.
const transient=new Set([
  'updatedAt','lastOpenedAt','editHistory','initialEditorSnapshot',
  'manualEditorSnapshot','draftHistorySnapshots','autoSceneSnapshots',
  'autoSceneSnapshotStore','sceneOperations','sceneOperationsSinceSnapshot',
  'sceneFirstUnsnapshottedAt','lastAutoSceneSnapshotAt',
  'projectDocumentPath','projectDocumentEncoding','projectDocumentProvider',
  'coverImageID','coverSceneHash','coverStaticPath','coverBaselineUpdatedAt'
]);

export function projectSemanticState(project){
  if(!project||!Array.isArray(project.drafts))throw Error('作品正文不完整');
  const clean=(value)=>{
    if(Array.isArray(value))return value.map(clean);
    if(!value||typeof value!=='object'){
      if(typeof value==='number'&&!Number.isFinite(value))throw Error('作品包含无效数值');
      return value;
    }
    return Object.fromEntries(Object.entries(value)
      .filter(([key,item])=>!transient.has(key)&&!key.startsWith('__cloud')&&item!==undefined)
      .map(([key,item])=>[key,clean(item)]));
  };
  return clean(project);
}

export const projectSemanticFingerprint=project=>canonicalTaskSource(projectSemanticState(project));

import {craftDigest,craftSceneHash,layerFingerprint} from './craft-fingerprint.js';

// Independent compiles of the same exported task must produce the same scene
// identities as well as geometry. Existing base-scene IDs remain untouched.
export function stabilizeImportedCraftScene(draft,base,taskId){
 const before=craftSceneHash(draft),mapping=new Map(),existing=new Set(['items','textBlocks','primitives','strokes'].flatMap(f=>(base?.[f]||[]).map(i=>i.id)));
 const managed=[];
 for(const field of ['items','textBlocks','primitives','strokes'])for(const [index,item] of (draft[field]||[]).entries()){
  if(existing.has(item.id))continue;
  const id='craft-'+craftDigest([taskId,field,item.creativePieceID||item.agentKey||item.key||index]).slice(7,39);mapping.set(item.id,id);item.id=id;
  if(item.aiManaged)managed.push(item);
 }
 for(const item of draft.items||[]){
  for(const key of ['target','target2'])if(mapping.has(item.materialRelation?.[key]))item.materialRelation[key]=mapping.get(item.materialRelation[key]);
  for(const slice of item.craftDisplaySlices||[])if(mapping.has(slice.targetId))slice.targetId=mapping.get(slice.targetId);
 }
 for(const item of managed)item.aiManaged={version:1,baseline:layerFingerprint(item)};
 const after=craftSceneHash(draft);
 for(const receipt of draft.craftReceipts||[])if(receipt.resultHash===before)receipt.resultHash=after;
 return draft;
}

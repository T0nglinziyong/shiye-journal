import {validateSceneExtensions} from './scene-v2.js';

// Conservative layer/field merge of two complete editable Scene v2 projects.
// A unique operation is replayed ONLY when its exact field precondition is
// satisfied, or when both editors explicitly changed that same field and
// timestamps make its winner clear. Never treat the entire project as a patch.
const clone=structuredClone;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const exists=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const time=s=>{const n=Date.parse(s||'');return Number.isFinite(n)?n:null;};
const keyOf=(node,field)=>'layer:'+node+':'+field;
const metaKey=(draft,field)=>'draft:'+draft+':'+field;
const find=(nodes,id)=>{for(const n of nodes){if(n.id===id)return n;if(n.type==='group'){const child=find(n.children||[],id);if(child)return child;}}return null;};
const detach=(nodes,id)=>{for(let i=0;i<nodes.length;i++){const n=nodes[i];if(n.id===id){nodes.splice(i,1);return true;}if(n.type==='group'&&detach(n.children||[],id))return true;}return false;};
function locate(nodes,id,parent=null){
 for(const n of nodes){if(n.id===id)return {node:n,parent,arr:nodes};
  if(n.type==='group'){const found=locate(n.children||[],id,n);if(found)return found;}
 }return null;
}
function outlinePosition(tree,id,parent=null){
 for(const row of tree||[]){
  if(row.id===id)return {parent,siblings:tree};
  const hit=outlinePosition(row.children,id,row.id);if(hit)return hit;
 }return null;
}
function insertByOutline(draft,delta,id,after){
 const position=outlinePosition(delta.structure?.after||[],id);
 if(!position)return false;
 const target=position.parent?find(draft.layers,position.parent)?.children:draft.layers;
 if(!Array.isArray(target)||find(draft.layers,id))return false;
 const offset=position.siblings.findIndex(n=>n.id===id);
 const next=position.siblings.slice(offset+1).find(n=>target.some(t=>t.id===n.id));
 const i=next?target.findIndex(n=>n.id===next.id):target.length;
 target.splice(i,0,clone(after));
 return true;
}
function changedFields(operations){
 const latest=new Map();
 for(const op of operations||[]){
  const at=time(op.at);if(at===null)return null;
  const delta=op.delta;if(!delta||delta.kind!=='scene-transaction-v2')return null;
  for(const row of delta.nodes||[]){
   if(row.whole)latest.set(keyOf(row.id,'__existence'),at);
   else for(const field of row.fields||[])latest.set(keyOf(row.id,field.key),at);
  }
  for(const field of delta.meta||[])latest.set(metaKey(delta.draftID,field.key),at);
  if(delta.structure)latest.set(metaKey(delta.draftID,'__structure'),at);
 }
 return latest;
}
function resolveField(target,change,stamp,remoteTouch,unknownRemoteStamp,identifier){
 const {key,before,beforeHas,after,afterHas}=change;
 const currentHas=exists(target,key),current=target[key];
 if(currentHas===afterHas&&(!afterHas||same(current,after)))return true;
 if(currentHas===beforeHas&&(!beforeHas||same(current,before))){
   if(afterHas)target[key]=clone(after);else delete target[key];
   return true;
 }
 // Competing edits on a field: the latest *explicit edit* wins. Only the
 // conflicting field changes, never other properties of the same layer.
 const contender=remoteTouch.get(identifier)??unknownRemoteStamp;
 if(contender===null||stamp===null)return false;
 if(stamp>contender){if(afterHas)target[key]=clone(after);else delete target[key];}
 return true; // tie / older edit: preserve already committed cloud field
}
export function mergeEditableSceneProjects(local,remote){
 if(!local||!remote||local.id!==remote.id||!Array.isArray(local.drafts)||!Array.isArray(remote.drafts))return null;
 const source=local.sceneOperations, target=remote.sceneOperations;
 if(!Array.isArray(source)||!source.length||!Array.isArray(target))return null;
 if(source.some(op=>typeof op?.id!=='string'||!op.id)||target.some(op=>typeof op?.id!=='string'||!op.id))return null;
 if(local.drafts.length!==remote.drafts.length||local.drafts.some(d=>!remote.drafts.some(x=>x.id===d.id)))return null;
 const remoteIDs=new Set(target.map(op=>op.id));
 const incoming=source.filter(op=>!remoteIDs.has(op.id));
 // A Save/Complete with no new layer edits must not replace fresh remote
 // layers simply because it updated the document timestamp.
 if(incoming.length>30||target.length>30)return null;
 const localIDs=new Set(source.map(op=>op.id)),foreign=target.filter(op=>!localIDs.has(op.id));
 const remoteTouch=changedFields(foreign);
 if(!remoteTouch)return null;
 const result=clone(remote),remoteFallback=time(remote.updatedAt);
 if(remoteFallback===null)return null;
 for(const op of incoming){
  const stamp=time(op.at),delta=op.delta;
  if(stamp===null||delta?.kind!=='scene-transaction-v2'||!Array.isArray(delta.nodes)||!Array.isArray(delta.meta))
    return null;
  const draft=result.drafts.find(d=>d.id===delta.draftID);
  if(!draft||draft.sceneVersion!==2||!Array.isArray(draft.layers))return null;
  // Exact structure reorder/ungroup of existing nodes is not yet safely
  // transformable across concurrent reorder: send it to existing LWW+backup.
  if(delta.structure){
   if(!Array.isArray(delta.structure.before)||!Array.isArray(delta.structure.after))
     return null;
   const previousIds=new Set(delta.structure.before.flatMap(function flatten(n){return [n.id,...(n.children||[]).flatMap(flatten)];}));
   const afterIds=new Set(delta.structure.after.flatMap(function flatten(n){return [n.id,...(n.children||[]).flatMap(flatten)];}));
   if([...previousIds].every(id=>afterIds.has(id))&&[...afterIds].every(id=>previousIds.has(id)))
     return null;
  }
  for(const node of delta.nodes){
   if(typeof node.id!=='string')return null;
   if(node.whole){
    if(node.before===null&&node.after){
     if(find(draft.layers,node.id))return null; // never overwrite same ID
     // Group insertion brings its children with it. If a descendant was
     // inserted with the group, its own op will see it already present.
     if(!insertByOutline(draft,delta,node.id,{...node.after,...(node.after.type==='group'?{children:[]}:{})}))return null;
    }else if(node.after===null&&node.before)detach(draft.layers,node.id); // delete wins over modify
    else return null;
   }else{
    const target=find(draft.layers,node.id);
    if(!target)continue; // remote deletion takes precedence over edit
    for(const field of node.fields||[]){
     if(!resolveField(target,field,stamp,remoteTouch,remoteFallback,keyOf(node.id,field.key)))return null;
    }
   }
  }
  for(const field of delta.meta){
   if(field.key==='id'||field.key==='layers'||field.key==='sceneVersion')return null;
   if(!resolveField(draft,field,stamp,remoteTouch,remoteFallback,metaKey(delta.draftID,field.key)))return null;
  }
 }
 for(const draft of result.drafts)try{validateSceneExtensions(draft);}catch{return null;}
 const ordered=[...target,...incoming].sort((a,b)=>(time(a.at)??0)-(time(b.at)??0)||a.id.localeCompare(b.id));
 result.sceneOperations=ordered.slice(-30);
 if(local.__cloudSessionId)result.__cloudSessionId=local.__cloudSessionId;
 result.updatedAt=new Date(Math.max(time(local.updatedAt)??0,remoteFallback)).toISOString();
 result.sceneOperationsSinceSnapshot=Math.max(Number(local.sceneOperationsSinceSnapshot)||0,
   Number(remote.sceneOperationsSinceSnapshot)||0);
 // Keep existing remote archives and union new local snapshot references; a
 // conflicting hash always keeps the already committed remote bytes.
 const archiveStore={...(local.autoSceneSnapshotStore||{}),...(remote.autoSceneSnapshotStore||{})};
 result.autoSceneSnapshotStore=archiveStore;
 const seen=new Set();
 result.autoSceneSnapshots=[...(remote.autoSceneSnapshots||[]),...(local.autoSceneSnapshots||[])]
   .filter(entry=>{if(!entry?.id||seen.has(entry.id)||!archiveStore[entry.hash])return false;seen.add(entry.id);return true;})
   .sort((a,b)=>(time(b.at)??0)-(time(a.at)??0)).slice(0,40);
 // Project-level administrative changes still use latest-document semantics;
 // scene layers and draft properties are merged independently.
 if((time(local.updatedAt)??0)>remoteFallback){
   for(const k of ['title','isDraft','lastOpenedAt','styleTags']){
     if(exists(local,k))result[k]=clone(local[k]);
   }
 }
 return result;
}

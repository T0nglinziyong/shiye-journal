import {attachSceneV2} from './scene-v2.js';

// Undo/redo never persist a stack of complete Draft copies. A single pending
// pre-edit snapshot is compacted at the next checkpoint (or first undo) into
// a reversible transaction of changed layer payloads and small ID trees.
const copy=value=>structuredClone(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const own=(o,key)=>Object.prototype.hasOwnProperty.call(o,key);
const nodeContent=node=>{const {children,...value}=node;return value;};
function indexTree(layers){
 const nodes=new Map();
 const shape=(entries)=>entries.map(n=>{
  if(nodes.has(n.id))throw Error('历史记录含重复图层 ID');
  nodes.set(n.id,nodeContent(n));
  return n.type==='group'?{id:n.id,children:shape(n.children||[])}:{id:n.id};
 });
 return {nodes,outline:shape(layers)};
}
export function createSceneTransition(before,after){
 if(before.id!==after.id||before.sceneVersion!==2||after.sceneVersion!==2)throw Error('撤销历史不属于当前 Scene v2');
 const previous=indexTree(before.layers),next=indexTree(after.layers),meta=[];
 for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
  if(key==='layers')continue;
  if(!same(before[key],after[key]))meta.push({key,before:own(before,key)?copy(before[key]):null,
    after:own(after,key)?copy(after[key]):null,beforeHas:own(before,key),afterHas:own(after,key)});
 }
 const nodes=[];
 for(const id of new Set([...previous.nodes.keys(),...next.nodes.keys()])){
  const a=previous.nodes.get(id),b=next.nodes.get(id);
  if(same(a,b))continue;
  if(!a||!b){nodes.push({id,whole:true,before:a?copy(a):null,after:b?copy(b):null});continue;}
  // For large material metadata and long ink paths, store only fields that
  // actually changed, not full leaf objects on every move or font edit.
  const fields=[];
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
   if(!same(a[key],b[key]))fields.push({key,before:own(a,key)?copy(a[key]):null,
    after:own(b,key)?copy(b[key]):null,beforeHas:own(a,key),afterHas:own(b,key)});
  }
  nodes.push({id,fields});
 }
 const structure=same(previous.outline,next.outline)?null:{before:previous.outline,after:next.outline};
 return {kind:'scene-transaction-v2',draftID:before.id,meta,nodes,structure};
}
export const hasSceneChanges=transaction=>!!(transaction.meta.length||transaction.nodes.length||transaction.structure);
export function applySceneTransition(draft,transaction,which){
 if(!transaction||transaction.kind!=='scene-transaction-v2'||transaction.draftID!==draft.id||!['before','after'].includes(which))throw Error('无效的 Scene v2 撤销事务');
 const result=copy(draft),byId=indexTree(result.layers).nodes;
 for(const change of transaction.nodes){
  if(change.whole){
   if(change[which]===null)byId.delete(change.id);
   else byId.set(change.id,copy(change[which]));
  }else{
   const existing=byId.get(change.id);
   if(!existing)throw Error('撤销所需图层缺失：'+change.id);
   for(const field of change.fields){
    if(field[which+'Has'])existing[field.key]=copy(field[which]);
    else delete existing[field.key];
   }
  }
 }
 if(transaction.structure){
  const rebuild=outline=>outline.map(({id,children})=>{
   const value=byId.get(id);if(!value)throw Error('历史图层数据缺失：'+id);
   return children?{...value,children:rebuild(children)}:value;
  });
  result.layers=rebuild(transaction.structure[which]);
 }else{
  const update=layers=>{for(let i=0;i<layers.length;i++){
   const n=layers[i],value=byId.get(n.id);if(!value)throw Error('历史图层数据缺失：'+n.id);
   layers[i]=n.type==='group'?{...value,children:n.children}:{...value};
   if(layers[i].type==='group')update(layers[i].children);
  }};
  update(result.layers);
 }
 for(const change of transaction.meta){
  if(change[which+'Has'])result[change.key]=copy(change[which]);
  else delete result[change.key];
 }
 return attachSceneV2(result);
}

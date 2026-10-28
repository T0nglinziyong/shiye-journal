// Duplication is one structural operation, not a collection of per-type
// aliases. Digital data is cloned; real material sources require remapping.
import {creationNode,creationNodes,creationLocation,insertSceneNode} from './creation-scene-core.js';
import {attachSceneV2,assertSceneEditable} from './scene-v2.js';
import {convertNodeFrame,spatialPath,IDENTITY} from './scene-spatial.js';
import {itemFromAsset} from './domain.js';

export function duplicateCreationNode(doc,item,assets,{finishNode,assetFor}){
 const original=creationNode(doc,item.target),source=structuredClone(original),nodes=creationNodes([source]);
 const sourcePath=spatialPath(doc.page.layers,original.id),parent=item.parent===undefined?sourcePath.ancestors.at(-1)?.id:item.parent;
 if(parent&&creationNode(doc,parent).type!=='group')throw Error('副本父级必须为组合');
 const ids=new Map(),originalIDs=new Map(),usedKeys=new Set();
 for(const n of nodes){
  const actual=creationNode(doc,n.id);assertSceneEditable(attachSceneV2(doc.page),actual.id);
  const next=n.id===original.id?item.id:item.id+'-'+(n.creativePieceID||n.agentKey||n.key||n.id);
  if(next.length>128)throw Error('副本子节点编号过长，请缩短 id');
  originalIDs.set(n.id,next);for(const alias of [n.id,n.creativePieceID,n.agentKey,n.key].filter(Boolean))ids.set(alias,next);
 }
 for(const n of nodes){
  const previous=n.id,next=originalIDs.get(previous);
  if(n.type==='material'){
   const keys=[...new Set([n.id,n.creativePieceID,n.agentKey,n.key].filter(k=>k&&Object.hasOwn(item.materialMap||{},k)))];
   if(keys.length!==1)throw Error('实体副本必须按素材节点唯一映射 materialMap：'+previous);
   usedKeys.add(keys[0]);const asset=assetFor(doc,assets,item.materialMap[keys[0]]);
   if(asset.kind==='tape')throw Error('胶带请通过 material.tape 显式取段，不能以副本隐式取料');
   const fresh=itemFromAsset(asset,doc.page,n.x,n.y,n.zIndex);fresh.rotation=n.rotation||0;
   const oldParent=n.creativeGroupID;Object.keys(n).forEach(k=>delete n[k]);Object.assign(n,fresh,{id:next,type:'material',creativePieceID:next});
   if(oldParent&&ids.has(oldParent))n.creativeGroupID=ids.get(oldParent);
   n.generationBaseline={...n.generationBaseline,rotation:n.rotation};
  }else{
   n.id=next;n.agentKey=next;
   for(const key of ['key','aiManaged','userOverrideFlags','lastTransform','manualVisualCopy','manualVisualResize','manualGeometryOverride','creativePieceID'])delete n[key];
   if(n.creativeGroupID)n.creativeGroupID=ids.get(n.creativeGroupID)||undefined;
   if(n.lettering?.slots)n.lettering.slots=n.lettering.slots.map(id=>ids.get(id)||id);
   for(const channel of ['place','size']){
    const binding=n.layoutConstraint?.[channel];if(!binding)continue;
    const ref=binding.reference;
    if(ref?.startsWith('node:')&&ids.has(ref.slice(5)))binding.reference='node:'+ids.get(ref.slice(5));
    else if(ref!=='parent'||previous===original.id)delete n.layoutConstraint[channel];
   }
   if(n.layoutConstraint&&!n.layoutConstraint.size)delete n.layoutConstraint.sizeAspectRatio;
   if(n.layoutConstraint&&!n.layoutConstraint.place&&!n.layoutConstraint.size)delete n.layoutConstraint;
  }
 }
 for(const key of Object.keys(item.materialMap||{}))if(!usedKeys.has(key))throw Error('materialMap 含未使用或非素材节点：'+key);
 // The explicit new place supersedes the original root constraint; descendants
 // keep remapped internal relationships and their local coordinate frames.
 delete source.layoutConstraint;
 const destination=parent?spatialPath(doc.page.layers,creationNode(doc,parent).id).world:IDENTITY;
 convertNodeFrame(source,sourcePath.parentWorld,destination,doc.page.canvas);
 doc=insertSceneNode(doc,source,assets,parent?creationNode(doc,parent).id:null);
 return finishNode(doc,source.id,{place:item.place,order:item.order},assets,{created:true});
}

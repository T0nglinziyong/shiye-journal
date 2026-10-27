import {sceneDisplaySiblings} from './craft-display.js';
import {rigidMatrix,multiplyMatrix,inverseMatrix,transformPoint,matrixAngle} from './scene-spatial.js';
const keyOf=node=>node.renderKey||node.id;
const hasLinks=nodes=>nodes.some(node=>node.layoutConstraint||node.children&&hasLinks(node.children));
const pose=node=>node.type==='group'?node.localTransform||null:node.type==='ink'?null:rigidMatrix(node.x,node.y,node.rotation||0);
function contentKey(node){
 const content={...node};
 delete content.layoutConstraint;
 if(pose(node)){if(node.type==='group')delete content.localTransform;else{delete content.x;delete content.y;delete content.rotation;}}
 return JSON.stringify(content);
}
const dispose=object=>{try{object?.dispose?.();}catch{/* Disposal cannot keep a stale preview installed. */}};

// A gesture has one immutable baseline. Every coalesced update runs the real
// edit/layout kernel on a disposable copy. Only projected roots that changed
// are drawn differently; canonical Scene, Fabric controls and history stay put.
export function createFabricLayoutPreview({canvas,bridge,requestFrame=globalThis.requestAnimationFrame,cancelFrame=globalThis.cancelAnimationFrame,onIssue=()=>{}}){
 let baseline=null,baselineNodes=null,epoch=0,sequence=0,frame=null,busy=false,pending=null,lastIssue=null;
 const cache=new Map(),display=new Map(),overrides=new Map(),retired=new Set();
 const collect=()=>{const used=new Set([...display.values(),...[...cache.values()].map(entry=>entry.object)]);for(const object of retired)if(!used.has(object)){dispose(object);retired.delete(object);}};
 const restoreObject=(object,descriptor)=>{if(descriptor)Object.defineProperty(object,'render',descriptor);else delete object.render;};
 const restore=()=>{for(const [object,descriptor] of overrides)restoreObject(object,descriptor);overrides.clear();display.clear();};
 const reset=()=>{
  epoch++;sequence++;baseline=null;baselineNodes=null;pending=null;lastIssue=null;
  if(frame!==null){cancelFrame(frame);frame=null;}
  restore();for(const entry of cache.values())retired.add(entry.object);cache.clear();collect();canvas.requestRenderAll();
 };
 const install=()=>{
  // Late-loaded originals may join during a gesture; use the latest canvas list.
  for(const object of canvas.getObjects()){
   if(object.sceneSelectionProxy)continue;
   const key=object.sceneRenderKey||object.sceneID;
   if(!display.has(key)){if(overrides.has(object)){restoreObject(object,overrides.get(object));overrides.delete(object);}continue;}
   if(!overrides.has(object)){
    overrides.set(object,Object.getOwnPropertyDescriptor(object,'render'));
    const original=object.render;
    object.render=function(ctx){if(display.has(key))display.get(key)?.render(ctx);else original.call(this,ctx);};
   }
  }
  canvas.requestRenderAll();
 };
 const schedule=()=>{if(frame===null&&!busy&&pending&&baseline)frame=requestFrame(()=>{frame=null;void run();});};
 const run=async()=>{
  if(!pending||!baseline||busy)return;
  const apply=pending;pending=null;busy=true;const token=epoch,revision=sequence;
  try{
   const scratch=structuredClone(baseline);apply(scratch);
   const changed=sceneDisplaySiblings(scratch.layers).filter(node=>baselineNodes.get(keyOf(node))!==JSON.stringify(node));
   const results=await Promise.allSettled(changed.map(async node=>{
    const key=keyOf(node),content=contentKey(node);let entry=cache.get(key);
    if(!entry||entry.content!==content){
     const object=await bridge.fromNode(node);
     if(token!==epoch){dispose(object);return null;}
     const previous=cache.get(key);
     entry={content,object,node,center:object?.getCenterPoint(),angle:object?.angle||0};
     cache.set(key,entry);
     if(previous?.object)retired.add(previous.object);
    }
    entry.object?.set('canvas',canvas);
    return {key,entry,node};
   }));
   if(token!==epoch)return;
   const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
   // Never paint an older decoded geometry after a newer pointer packet.
   if(revision===sequence){
    display.clear();
    for(const {value} of results)if(value){const {key,entry,node}=value;
     if(entry.object&&pose(node)){
      const delta=multiplyMatrix(pose(node),inverseMatrix(pose(entry.node))),center=transformPoint(delta,entry.center.x,entry.center.y);
      entry.object.set({angle:entry.angle+matrixAngle(delta)});entry.object.setPositionByOrigin(center,'center','center');entry.object.setCoords();
     }
     display.set(key,entry.object);
    }
    install();collect();
   }
  }catch(error){
   if(token===epoch){restore();canvas.requestRenderAll();if(error.message!==lastIssue){lastIssue=error.message;onIssue(error);}}
  }finally{busy=false;schedule();}
 };
 return {
  begin(page){reset();if(!hasLinks(page.layers||[]))return false;baseline=structuredClone(page);baselineNodes=new Map(sceneDisplaySiblings(baseline.layers).map(node=>[keyOf(node),JSON.stringify(node)]));return true;},
  update(apply){if(!baseline)return;pending=apply;sequence++;schedule();},
  refresh:install,
  reset,
  get active(){return baseline!==null;},
  get pending(){return busy||frame!==null||pending!==null;}
 };
}

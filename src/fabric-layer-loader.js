// Resolve visible Scene layers in parallel. Each finished object enters the
// correct stack position; one slow image never delays text or vector layers.
export function projectFabricLayers(canvas,nodes,bridge,{readOnly=false,onIssue=()=>{},isCurrent=()=>true}={}){
  const sorted=[...(nodes||[])].sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
  return Promise.allSettled(sorted.map((node,sceneIndex)=>
    Promise.resolve().then(()=>bridge.fromNode(node)).then(object=>{
      if(!isCurrent(node)||!object)return;
      if(canvas.getObjects().some(item=>item.sceneID===object.sceneID))return;
      object.sceneIndex=sceneIndex;
      if(readOnly)object.set({selectable:false,evented:false});
      const position=canvas.getObjects().filter(item=>item.sceneIndex<sceneIndex).length;
      canvas.insertAt(position,object);
      canvas.requestRenderAll();
    }).catch(error=>{
      if(isCurrent(node))onIssue(error,node);
      throw error;
    })
  ));
}

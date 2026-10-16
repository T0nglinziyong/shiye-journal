// Resolve visible Scene layers in parallel. Each finished object enters the
// correct stack position; one slow image never delays text or vector layers.
export function projectFabricLayers(canvas,nodes,bridge,{readOnly=false,onIssue=()=>{},isCurrent=()=>true,onAdded=()=>{}}={}){
  const sorted=[...(nodes||[])].sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
  return Promise.allSettled(sorted.map((node,sceneIndex)=>
    Promise.resolve().then(()=>bridge.fromNode(node)).then(object=>{
      if(!isCurrent(node)||!object)return;
      const key=object.sceneRenderKey||object.sceneID||node.renderKey||node.id;
      if(canvas.getObjects().some(item=>!item.sceneSelectionProxy&&
        (item.sceneRenderKey||item.sceneID)===key))return;
      object.sceneIndex=sceneIndex;
      if(readOnly)object.set({selectable:false,evented:false});
      const position=canvas.getObjects().filter(item=>item.sceneIndex<sceneIndex).length;
      canvas.insertAt(position,object);
      canvas.requestRenderAll();
      onAdded(object,node);
    }).catch(error=>{
      if(isCurrent(node))onIssue(error,node);
      throw error;
    })
  ));
}

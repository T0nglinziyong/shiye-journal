// Member frames are a cheap rejection test before painted-pixel hit testing.
// The active frame separately permits dragging through transparent gaps.
export function fabricMemberAt(object,point){
  if(object.visible===false)return false;
  if(object.sceneType==='group'&&object.getObjects)
    return object.getObjects().some(child=>fabricMemberAt(child,point));
  return object.containsPoint(point);
}
export function selectableFabricObjectAt(canvas,object,point,viewport,{includeInk=false}={}){
  const ink=includeInk&&object.sceneType==='ink';
  if(object.visible===false||object.sceneSelectionProxy||
    (!ink&&(object.evented===false||object.selectable===false))||!viewport)return false;
  if(fabricMemberAt(object,point)&&!canvas.isTargetTransparent(object,viewport.x,viewport.y))return true;
  // A small screen-space tolerance helps thin ink, lettering and unfilled
  // shape outlines without selecting the whole transparent object frame.
  // Sample painted pixels only; transparent interiors and group gaps stay empty.
  if(!['ink','shape','text'].includes(object.sceneType))return false;
  const screenScale=canvas.upperCanvasEl?.getBoundingClientRect?.().width/canvas.width||1;
  const radius=Math.min(16,8/Math.max(.25,screenScale));
  for(const [dx,dy] of [[radius,0],[-radius,0],[0,radius],[0,-radius],
    [radius*.7,radius*.7],[-radius*.7,radius*.7],[radius*.7,-radius*.7],[-radius*.7,-radius*.7]]){
    const sample={x:point.x+dx,y:point.y+dy};
    if(fabricMemberAt(object,sample)&&!canvas.isTargetTransparent(object,viewport.x+dx,viewport.y+dy))return true;
  }
  return false;
}

// Fabric normally chooses a higher stacked object even inside the active
// frame. Our editor gives that whole frame ownership until it is deselected.
export function installSelectionFramePriority(canvas){
  const findTarget=canvas.findTarget.bind(canvas);
  canvas.findTarget=event=>{
    // Reuse Fabric's per-event target. Recomputing controls during the same
    // event can change its active corner while a transform is being prepared.
    if(canvas._targetInfo)return canvas._targetInfo;
    const active=canvas.getActiveObject();
    if(!canvas.skipTargetFind&&active?.selectable!==false&&active?.visible!==false&&active&&
      (active.findControl(canvas.getViewportPoint(event),event.pointerType==='touch')||
        active.containsPoint(canvas.getScenePoint(event)))){
      return {target:active,container:active,subTargets:[],currentTarget:active,
        currentContainer:active,currentSubTargets:[]};
    }
    return findTarget(event);
  };
}

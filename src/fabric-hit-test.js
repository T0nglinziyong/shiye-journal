// Unselected groups hit only the union of visible member frames. The active
// selection frame is handled separately and permits dragging through its gaps.
export function fabricMemberAt(object,point){
  if(object.visible===false)return false;
  if(object.sceneType==='group'&&object.getObjects)
    return object.getObjects().some(child=>fabricMemberAt(child,point));
  return object.containsPoint(point);
}
export function selectableFabricObjectAt(canvas,object,point,viewport){
  return object.visible!==false&&!object.sceneSelectionProxy&&
    object.evented!==false&&object.selectable!==false&&fabricMemberAt(object,point)&&
    (!object.clipPath||!canvas.isTargetTransparent(object,viewport.x,viewport.y));
}

// A Fabric group owns its full rectangular frame, including gaps between
// children and transparent cuts. Those gaps must behave like empty paper.
export function selectableFabricObjectAt(canvas,object,point,viewport){
  return object.visible!==false&&!object.sceneSelectionProxy&&
    object.evented!==false&&object.selectable!==false&&object.containsPoint(point)&&
    (object.sceneType!=='group'||!canvas.isTargetTransparent(object,viewport.x,viewport.y));
}

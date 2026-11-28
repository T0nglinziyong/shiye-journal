// A nested or multi-object selection uses one Fabric control frame. Keep the
// projected children under that frame while the pointer moves; Scene is still
// changed only once, when Fabric reports object:modified.
export function createFabricSelectionPreview(fabric,canvas,ids){
  const selected=new Set(ids);
  const entries=new Map();
  const visit=object=>{
    if(selected.has(object.sceneID)&&object.sceneType!=='group'&&!entries.has(object)){
      const parent=object.group;
      const world=object.calcTransformMatrix();
      entries.set(object,{object,parent,left:object.left,top:object.top,angle:object.angle||0,
        scaleX:object.scaleX,scaleY:object.scaleY,worldCenter:new fabric.Point(world[4],world[5])});
    }
    for(const child of object.getObjects?.()||[])visit(child);
  };
  const collect=()=>{
    for(const root of canvas.getObjects())if(!root.sceneSelectionProxy)visit(root);
  };
  collect();
  const dirty=object=>{for(let item=object;item;item=item.group)item.dirty=true;};
  return {
    apply(origin,center,angle,scale=1){
      collect();
      const radians=angle*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
      for(const entry of entries.values()){
        if(!entry.object.canvas)continue;
        const dx=entry.worldCenter.x-origin.x,dy=entry.worldCenter.y-origin.y;
        const world=new fabric.Point(center.x+scale*(dx*cos-dy*sin),center.y+scale*(dx*sin+dy*cos));
        const local=entry.parent?fabric.util.transformPoint(world,
          fabric.util.invertTransform(entry.parent.calcTransformMatrix())):world;
        entry.object.set({angle:entry.angle+angle,scaleX:entry.scaleX*scale,scaleY:entry.scaleY*scale});
        entry.object.setPositionByOrigin(local,'center','center');
        entry.object.setCoords();dirty(entry.object);
      }
      canvas.requestRenderAll();
    },
    restore(){
      for(const entry of entries.values()){
        if(!entry.object.canvas)continue;
        entry.object.set({left:entry.left,top:entry.top,angle:entry.angle,scaleX:entry.scaleX,scaleY:entry.scaleY});
        entry.object.setCoords();dirty(entry.object);
      }
      canvas.requestRenderAll();
    }
  };
}

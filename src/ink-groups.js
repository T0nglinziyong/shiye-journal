// Consecutive strokes occupy one Scene layer until another object takes the top.
// Each stroke stays independent inside the group so erasing remains precise.
export const editableInkLayer=node=>!!node&&!node.locked&&!node.isLocked&&
  !node.hidden&&!node.isHidden&&!node.isParked&&!node.parked&&node.visible!==false;

export function appendInkStroke(draft,stroke,groupID){
  const layers=draft.layers;
  const top=[...layers].sort((a,b)=>(b.zIndex??0)-(a.zIndex??0))[0];
  if(top?.type==='group'&&top.autoInkGroup&&editableInkLayer(top)&&
    top.children?.every(node=>node.type==='ink'&&editableInkLayer(node))){
    stroke.creativeGroupID=top.id;
    stroke.zIndex=(top.children.at(-1)?.zIndex??0)+1;
    top.children.push(stroke);
    return {root:top,replacedID:top.id};
  }
  if(top?.type==='ink'&&editableInkLayer(top)){
    const group={id:groupID,type:'group',name:'手写笔迹',autoInkGroup:true,
      opacity:1,blendMode:'normal',zIndex:stroke.zIndex,children:[top,stroke]};
    top.creativeGroupID=group.id;
    stroke.creativeGroupID=group.id;
    const index=layers.indexOf(top);
    layers.splice(index,1,group);
    return {root:group,replacedID:top.id};
  }
  layers.push(stroke);
  return {root:stroke,replacedID:null};
}

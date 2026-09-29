// Native vector vertices are immutable geometry. Colour, placement and size
// remain editable, so history copies those small values, not millions of points.
export function snapshotDraft(draft){
  const geometry=new Map();
  const primitives=(draft.primitives||[]).map(shape=>{
    if(!shape.vectorLayers)return shape;
    const layers=shape.vectorLayers.map((layer,index)=>{
      const {rects,paths,...style}=layer;if((rects&&!Object.isFrozen(rects))||(paths&&!Object.isFrozen(paths)))return layer;geometry.set(shape.id+':'+index,{rects,paths});return style;
    });return {...shape,vectorLayers:layers};
  });
  const snapshot=structuredClone({...draft,primitives});
  for(const shape of snapshot.primitives)if(shape.vectorLayers)shape.vectorLayers.forEach((layer,index)=>{const saved=geometry.get(shape.id+':'+index);if(!saved)return;if(saved.rects)layer.rects=saved.rects;if(saved.paths)layer.paths=saved.paths;});
  return snapshot;
}

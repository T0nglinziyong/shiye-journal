import {inkLocalFrame} from './graphic-geometry.js';

// The inspector may receive a world-coordinate projection Proxy. Snapshot
// its enumerable values before cloning; never mutate the canonical Scene.
export function graphicEffectPreviewNode(node){
 const copy=structuredClone({...node}),box=copy.type==='ink'?inkLocalFrame(copy):copy;
  const factor=Math.min(220/box.width,58/box.height),effect=copy.graphicOutline;
  if(effect)copy.graphicOutline={...effect,width:effect.width*factor,offsetX:effect.offsetX*factor,offsetY:effect.offsetY*factor};
  if(copy.shadow)copy.shadow={...copy.shadow,offsetX:copy.shadow.offsetX*factor,offsetY:copy.shadow.offsetY*factor,blur:copy.shadow.blur*factor};
  if(copy.type==='ink'){const xs=copy.points.map(p=>p.x),ys=copy.points.map(p=>p.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;copy.points=copy.points.map(p=>({...p,x:140+(p.x-cx)*factor,y:41+(p.y-cy)*factor}));copy.width*=factor;}
  else{copy.x=140;copy.y=41;copy.width*=factor;copy.height*=factor;copy.rotation=0;if(copy.lineWidth)copy.lineWidth*=factor;}
  delete copy.layoutConstraint;
 return copy;
}

import {shapeSVG} from './editor-tools-model.js';
const previews=new WeakMap();
// Keep numeric editable geometry in the document. The screen only needs one
// decoded SVG image, not thousands of separate DOM nodes per colour layer.
export function shapePreview(shape){
  const saved=previews.get(shape);
  let style,geometry;
  if(shape.sourceIdentifier==='cece-native-goodnotes-v1'&&shape.vectorLayers){
    geometry=shape.vectorLayers.map(layer=>{const value=layer.rects||layer.paths;if(value&&!Object.isFrozen(value)){for(const row of value){if(layer.paths)for(const point of row)Object.freeze(point);Object.freeze(row);}Object.freeze(value);}return value;});
    style=JSON.stringify([shape.kind,shape.vectorSize,shape.width,shape.height,shape.fill,shape.stroke,shape.lineWidth,shape.vectorLayers.map(({rects,paths,...layer})=>layer)]);
    if(saved?.style===style&&geometry.length===saved.geometry?.length&&geometry.every((value,i)=>value===saved.geometry[i]))return saved.url;
  }
  const key=shapeSVG(shape);
  if(saved?.key===key)return saved.url;
  const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(key);previews.set(shape,{key,url,style,geometry});return url;
}
export const shapeTag=shape=>`<img class="shape-preview" loading="lazy" decoding="async" src="${shapePreview(shape)}" alt="图形">`;

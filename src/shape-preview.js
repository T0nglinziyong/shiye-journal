import {shapeSVG} from './editor-tools-model.js';
const previews=new WeakMap();
// Keep numeric editable geometry in the document. The screen only needs one
// decoded SVG image, not thousands of separate DOM nodes per colour layer.
export function shapePreview(shape){
  const saved=previews.get(shape),key=shapeSVG(shape);
  if(saved?.key===key)return saved.url;
  const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(key);previews.set(shape,{key,url});return url;
}
export const shapeTag=shape=>`<img class="shape-preview" loading="lazy" decoding="async" src="${shapePreview(shape)}" alt="图形">`;

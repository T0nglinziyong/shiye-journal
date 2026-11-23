import {shapeThumbnailSVG} from './editor-tools-model.js';
// Presentation only: the editable Scene retains its vector geometry and paper
// parameters. SVG images otherwise re-rasterize their thousands of grain marks
// during every paint and alpha hit-test in Chromium/Safari.
const cache=new Map();let pixels=0;
const budget=12_000_000;
export async function fabricShapeRaster(node,fabric){
 const {x,y,rotation,id,zIndex,opacity,locked,isLocked,renderKey,...paint}=node;
 const key=JSON.stringify(paint);
 if(cache.has(key)){const row=cache.get(key);cache.delete(key);cache.set(key,row);return row.promise;}
 const row={size:0,promise:null};
 row.promise=(async()=>{
   const image=await fabric.util.loadImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(shapeThumbnailSVG(node)));
   const canvas=fabric.getEnv().document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
   canvas.getContext('2d').drawImage(image,0,0);
   row.size=canvas.width*canvas.height;if(cache.get(key)!==row)return canvas;pixels+=row.size;
   while(pixels>budget&&cache.size){const first=cache.keys().next().value;const entry=cache.get(first);cache.delete(first);pixels-=entry.size;}
   return canvas;
 })().catch(error=>{cache.delete(key);throw error;});
 cache.set(key,row);return row.promise;
}

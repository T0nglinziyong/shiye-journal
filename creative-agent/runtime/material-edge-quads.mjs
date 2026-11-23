import {PNG} from 'pngjs';
import {silhouetteFromAlpha} from '../../src/raster-silhouette.js';
import {approximateQuad} from '../../src/creation-edge-alignment.js';

// Derive small, transient visual frames from the already verified images.
// They are never substituted for source masks or written into project data.
export function deriveMaterialEdgeQuads(source,images){
 const result={};
 for(const material of source.materials||[]){
  const bytes=images[material.alias];if(!bytes||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)continue;
  try{
   const image=PNG.sync.read(bytes),size=Math.min(1,256/Math.max(image.width,image.height));
   const w=Math.max(1,Math.round(image.width*size)),h=Math.max(1,Math.round(image.height*size)),pixels=new Uint8Array(w*h*4);
   let transparent=0;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const alpha=image.data[(Math.floor(y/size)*image.width+Math.floor(x/size))*4+3];
    pixels[(y*w+x)*4+3]=alpha;
    if(alpha<16)transparent++;
   }
   // A fully opaque PNG can still contain a photographed background. Its
   // rectangular file boundary is not evidence of the paper's visible edge.
   if(transparent<Math.max(4,w*h*.002))continue;
   const silhouette=silhouetteFromAlpha(pixels,w,h);
   if(silhouette?.length!==1)continue;
   const quad=approximateQuad(silhouette[0][0]);if(quad)result[material.assetID]=quad;
  }catch{/* An irregular or undecodable material needs an observed quad. */}
 }
 return result;
}

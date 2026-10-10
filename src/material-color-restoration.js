// The colour pipeline is downstream of recognition. It never edits its input,
// box discovery, geometry, segmentation parameters or alpha masks.
// The rectified white backing sheet provides a spatial illuminant reference.
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const linear=v=>{v=clamp(v/255,0,1);return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
const srgb=v=>Math.round(255*(v<=.0031308?12.92*v:1.055*Math.pow(clamp(v,0,1),1/2.4)-.055));
const median=xs=>{if(!xs.length)return 0;xs.sort((a,b)=>a-b);return xs[xs.length>>1];};
export const COLOR_MODES=['original','auto'];
export function lightMapFromPixels(pixels,width,height,regions=[],{columns=5,rows=7}={}){
  if(!pixels||width<60||height<60||pixels.length!==width*height*4)return null;
  const excluded=regions.map(r=>({x:clamp(r.x-.018,0,1),y:clamp(r.y-.018,0,1),
    right:clamp(r.x+r.w+.018,0,1),bottom:clamp(r.y+r.h+.018,0,1)}));
  const references=Array.from({length:rows*columns},()=>[[],[],[]]),all=[[],[],[]];
  // Sample only neutral pixels outside every recognised box and outside the
  // 3mm protected frame. Never learn a pink/green sticker as "white paper".
  for(let y=Math.round(height*.025);y<height*.975;y+=4)for(let x=Math.round(width*.025);x<width*.975;x+=4){
    const u=x/width,v=y/height;
    if(excluded.some(b=>u>=b.x&&u<=b.right&&v>=b.y&&v<=b.bottom))continue;
    const at=(y*width+x)*4,r=pixels[at],g=pixels[at+1],b=pixels[at+2];
    const mean=(r+g+b)/3;
    if(pixels[at+3]<250||mean<125||Math.max(r,g,b)-Math.min(r,g,b)>24)continue;
    const cx=clamp(Math.floor(u*columns),0,columns-1),cy=clamp(Math.floor(v*rows),0,rows-1);
    for(let c=0;c<3;c++){const value=pixels[at+c];references[cy*columns+cx][c].push(value);all[c].push(value);}
  }
  if(all[0].length<40)return null; // no trustworthy white backing reference
  const global=all.map(median),target=242,globalGain=global.map(v=>clamp(linear(target)/Math.max(.08,linear(v)),.88,1.65));
  const gains=references.map(channels=>channels[0].length>=8
    ?channels.map((values,c)=>clamp(linear(target)/Math.max(.08,linear(median(values))),.88,1.65))
    :null);
  // Fall back to the global illuminant where a grid tile is covered by paper.
  // Spatial smoothing prevents visible seams between neighbouring tiles.
  const smooth=gains.map((gain,i)=>{
    const x=i%columns,y=Math.floor(i/columns),sum=[0,0,0],neighbors=[];
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
      const xx=x+ox,yy=y+oy;if(xx<0||xx>=columns||yy<0||yy>=rows)continue;
      const candidate=gains[yy*columns+xx];if(candidate)neighbors.push({gain:candidate,weight:ox===0&&oy===0?3:1});
    }
    if(!neighbors.length)return [...globalGain];
    for(const {gain,weight} of neighbors)for(let c=0;c<3;c++)sum[c]+=gain[c]*weight;
    const total=neighbors.reduce((n,v)=>n+v.weight,0);
    return sum.map(v=>v/total);
  });
  return {columns,rows,gains:smooth,samples:all[0].length};
}
export function lightGainAt(map,u,v){
  if(!map)return [1,1,1];
  const x=clamp(u*map.columns-.5,0,map.columns-1),y=clamp(v*map.rows-.5,0,map.rows-1),
    x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(map.columns-1,x0+1),y1=Math.min(map.rows-1,y0+1),
    dx=x-x0,dy=y-y0,
    a=map.gains[y0*map.columns+x0],b=map.gains[y0*map.columns+x1],
    c=map.gains[y1*map.columns+x0],d=map.gains[y1*map.columns+x1];
  return [0,1,2].map(i=>a[i]*(1-dx)*(1-dy)+b[i]*dx*(1-dy)+c[i]*(1-dx)*dy+d[i]*dx*dy);
}
export function restoreRGBPixels(pixels,width,height,map,sourceX=0,sourceY=0,sourceWidth=width,sourceHeight=height){
  if(!map)return pixels;
  const out=new Uint8ClampedArray(pixels);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;if(out[i+3]===0)continue;
    const gains=lightGainAt(map,(sourceX+x+.5)/sourceWidth,(sourceY+y+.5)/sourceHeight);
    for(let c=0;c<3;c++)out[i+c]=srgb(linear(pixels[i+c])*gains[c]);
    // Alpha is copied verbatim. The original source RGB remains available.
  }
  return out;
}
export async function estimatePageLighting(source,regions=[],{maxDimension=900,analysisRaster=null}={}){
  // Discovery already owns a 900px *unmodified* source RGB raster. When it
  // covers the corrected A4 page, reuse its pixels for the colour-only light
  // map instead of allocating a second canvas and resampling the whole page.
  if(analysisRaster?.data?.length===analysisRaster.width*analysisRaster.height*4)
    return lightMapFromPixels(analysisRaster.data,analysisRaster.width,analysisRaster.height,regions);
  const ratio=Math.min(1,maxDimension/Math.max(source.width,source.height));
  const width=Math.round(source.width*ratio),height=Math.round(source.height*ratio);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});
  ctx.drawImage(source,0,0,width,height);
  return lightMapFromPixels(ctx.getImageData(0,0,width,height).data,width,height,regions);
}
export function applyLightingToCrop(ctx,x,y,width,height,sourceWidth,sourceHeight,map){
  if(!map)return;
  const pixels=ctx.getImageData(0,0,width,height);
  pixels.data.set(restoreRGBPixels(pixels.data,width,height,map,x,y,sourceWidth,sourceHeight));
  ctx.putImageData(pixels,0,0);
}

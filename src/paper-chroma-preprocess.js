// Estimate the smoothly varying colour cast from four clear A4 paper corners.
// This copy is for candidate discovery only; extraction keeps original pixels.
export function neutralizePaperChroma(pixels,width,height){
  if(width<80||height<80||pixels.length!==width*height*4)return pixels;
  const corners=[[.06,.06],[.94,.06],[.06,.94],[.94,.94]].map(([u,v])=>{
    const channels=[[],[],[]];
    for(let y=Math.round((v-.018)*height);y<Math.round((v+.018)*height);y+=2)
      for(let x=Math.round((u-.018)*width);x<Math.round((u+.018)*width);x+=2){
        const at=(y*width+x)*4;
        for(let c=0;c<3;c++)channels[c].push(pixels[at+c]);
      }
    const rgb=channels.map(values=>values.sort((a,b)=>a-b)[values.length>>1]);
    const mean=(rgb[0]+rgb[1]+rgb[2])/3;
    return {rgb,chroma:rgb.map(value=>value-mean),mean};
  });
  // A coloured/dark page or an object over a corner cannot supply a reliable
  // white-paper reference. Leave that image untouched.
  if(corners.some(({rgb,mean})=>mean<110||Math.max(...rgb)-Math.min(...rgb)>35))return pixels;
  const out=new Uint8ClampedArray(pixels),cast=corners.map(c=>c.chroma);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=Math.max(0,Math.min(1,(x/width-.06)/.88)),v=Math.max(0,Math.min(1,(y/height-.06)/.88)),at=(y*width+x)*4;
    for(let c=0;c<3;c++){
      const top=cast[0][c]*(1-u)+cast[1][c]*u,bottom=cast[2][c]*(1-u)+cast[3][c]*u;
      out[at+c]=pixels[at+c]-(top*(1-v)+bottom*v);
    }
  }
  return out;
}

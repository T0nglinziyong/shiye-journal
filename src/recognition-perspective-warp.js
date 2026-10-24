// OpenCV 4 INTER_LINEAR's 5-bit interpolation table. The research package
// froze its input with this rasterization; OpenCV.js 5 warpPerspective rounds
// some pixels differently and can change a faint carrier's contour.
export function warpResearchPixels(source,sourceWidth,sourceHeight,inverse,width,height){
  const output=new Uint8ClampedArray(width*height*4),clamp=(value,max)=>Math.max(0,Math.min(max,value));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const denominator=inverse[6]*x+inverse[7]*y+inverse[8],
      sx=(inverse[0]*x+inverse[1]*y+inverse[2])/denominator,
      sy=(inverse[3]*x+inverse[4]*y+inverse[5])/denominator,
      qx=Math.floor(sx*32+.5),qy=Math.floor(sy*32+.5),
      ix=Math.floor(qx/32),iy=Math.floor(qy/32),fx=qx-ix*32,fy=qy-iy*32,
      x0=clamp(ix,sourceWidth-1),x1=clamp(ix+1,sourceWidth-1),
      y0=clamp(iy,sourceHeight-1),y1=clamp(iy+1,sourceHeight-1),
      a=(y0*sourceWidth+x0)*4,b=(y0*sourceWidth+x1)*4,
      c=(y1*sourceWidth+x0)*4,d=(y1*sourceWidth+x1)*4,
      wa=(32-fx)*(32-fy),wb=fx*(32-fy),wc=(32-fx)*fy,wd=fx*fy,
      out=(y*width+x)*4;
    for(let channel=0;channel<3;channel++)
      output[out+channel]=(source[a+channel]*wa+source[b+channel]*wb+
        source[c+channel]*wc+source[d+channel]*wd+512)>>10;
    output[out+3]=255;
  }
  return output;
}

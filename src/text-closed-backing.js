// Editable text can carry a solid paper backing. Rasterize its current glyphs,
// expand them by physical padding, then fill only enclosed transparent holes.
// The outer silhouette keeps its concavities; changing text/font recomputes it.
const cache=new Map();
function surfaceFor(ctx,width,height){
 if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(width,height);
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;
 }
 return new ctx.canvas.constructor(width,height);
}
function fillEnclosedHoles(image,width,height){
 const pixels=image.data,count=width*height,reachable=new Uint8Array(count),queue=new Int32Array(count);
 let head=0,tail=0;
 const visit=index=>{if(index<0||index>=count||reachable[index]||pixels[index*4+3]>=12)return;reachable[index]=1;queue[tail++]=index;};
 for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x);}
 for(let y=1;y<height-1;y++){visit(y*width);visit(y*width+width-1);}
 while(head<tail){const index=queue[head++],x=index%width,y=(index-x)/width;
  if(x>0)visit(index-1);if(x+1<width)visit(index+1);
  if(y>0)visit(index-width);if(y+1<height)visit(index+width);
 }
 for(let index=0;index<count;index++)if(pixels[index*4+3]<12&&!reachable[index])pixels[index*4+3]=255;
}
function backingSurface(ctx,node,text){
 const b=node.textBacking,key=[ctx.font,ctx.textAlign,ctx.letterSpacing||'',text,b.color,b.padding].join('\u0000');
 if(cache.has(key))return cache.get(key);
 const m=ctx.measureText(text),left=-(m.actualBoundingBoxLeft??0),right=m.actualBoundingBoxRight??m.width,
  top=-(m.actualBoundingBoxAscent??0),bottom=m.actualBoundingBoxDescent??0,
  margin=Math.ceil(b.padding)+4,width=Math.ceil(right-left+2*margin),height=Math.ceil(bottom-top+2*margin);
 if(width<1||height<1||width*height>2_000_000)return null;
 const surface=surfaceFor(ctx,width,height),raster=surface.getContext('2d',{willReadFrequently:true});
 raster.font=ctx.font;raster.textAlign=ctx.textAlign;raster.textBaseline='alphabetic';
 raster.letterSpacing=ctx.letterSpacing||'0px';raster.fillStyle=raster.strokeStyle='#000000';
 raster.lineWidth=2*b.padding;raster.lineCap='round';raster.lineJoin='round';
 const originX=margin-left,originY=margin-top;
 if(b.padding>0)raster.strokeText(text,originX,originY);
 raster.fillText(text,originX,originY);
 const image=raster.getImageData(0,0,width,height);fillEnclosedHoles(image,width,height);
 const rgb=b.color.slice(1).match(/../g).map(channel=>parseInt(channel,16));
 for(let i=0;i<image.data.length;i+=4){image.data[i]=rgb[0];image.data[i+1]=rgb[1];image.data[i+2]=rgb[2];}
 raster.putImageData(image,0,0);
 const result={surface,left:left-margin,top:top-margin};
 if(cache.size>=48)cache.clear();cache.set(key,result);
 return result;
}
export function paintTextClosedBacking(ctx,node,text,x,y){
 const backing=node.textBacking;if(!backing||!text.trim())return;
 const image=backingSurface(ctx,node,text);
 if(image){ctx.drawImage(image.surface,x+image.left,y+image.top);return;}
 // Long lines exceed the bounded scratch budget; still render a backing.
 ctx.save();try{ctx.strokeStyle=ctx.fillStyle=backing.color;ctx.lineJoin='round';ctx.lineWidth=2*backing.padding;if(backing.padding>0)ctx.strokeText(text,x,y);ctx.fillText(text,x,y);}finally{ctx.restore();}
}

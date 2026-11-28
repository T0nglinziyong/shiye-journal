// These coordinates select pixels from the original image. They never replace
// the library blob, so changing an asset back from tape restores its cutout.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function normalizeTapeFlatCrop(value){
  if(value==null)return null;
  const crop={left:Number(value.left),top:Number(value.top),right:Number(value.right),bottom:Number(value.bottom)};
  if(Object.values(crop).some(v=>!Number.isFinite(v)||v<0||v>1)||
    crop.right-crop.left<.02||crop.bottom-crop.top<.02)
    throw Error('胶带修平边界须位于原图内，且保留至少 2% 的宽高');
  return crop;
}

export function detectTapeFlatCrop(data,width,height,axis='x'){
  if(!(width>0&&height>0))return {left:0,top:0,right:1,bottom:1};
  const opaque=(x,y)=>data[(y*width+x)*4+3]>=32;
  const horizontal=axis!=='y',length=horizontal?width:height,thickness=horizontal?height:width;
  const at=(u,v)=>horizontal?opaque(u,v):opaque(v,u);
  const coverage=(u,from,to)=>{let n=0;for(let v=from;v<to;v++)if(at(u,v))n++;return n/Math.max(1,to-from);};
  // Determine the strip thickness from its center, away from cutout whiskers.
  const middleA=Math.floor(length*.3),middleB=Math.max(middleA+1,Math.ceil(length*.7));
  const rows=new Float32Array(thickness);
  for(let v=0;v<thickness;v++){
    let n=0;for(let u=middleA;u<middleB;u++)if(at(u,v))n++;
    rows[v]=n/(middleB-middleA);
  }
  let first=0,last=thickness;
  while(first<last-1&&rows[first]<.8)first++;
  while(last>first+1&&rows[last-1]<.8)last--;
  if(last-first<thickness*.12){first=0;last=thickness;}
  // A stable full-height body begins where most pixels across the thickness
  // are present. Discard stray horizontal hairs and ragged photographed ends.
  const threshold=.82;
  let start=0,end=length;
  while(start<end-1&&coverage(start,first,last)<threshold)start++;
  while(end>start+1&&coverage(end-1,first,last)<threshold)end--;
  if(end-start<length*.12){start=0;end=length;}
  // Recheck the long edges over the cropped body, so they appear straight.
  const edgeCoverage=v=>{let n=0;for(let u=start;u<end;u++)if(at(u,v))n++;return n/(end-start);};
  while(first<last-1&&edgeCoverage(first)<.85)first++;
  while(last>first+1&&edgeCoverage(last-1)<.85)last--;
  const bounds=horizontal?{left:start/width,right:end/width,top:first/height,bottom:last/height}:
    {left:first/width,right:last/width,top:start/height,bottom:end/height};
  return bounds.right-bounds.left>=.02&&bounds.bottom-bounds.top>=.02?
    bounds:{left:0,top:0,right:1,bottom:1};
}

export function tapeFlatCanvas(image,axis='x',manualCrop=null,{maxSize=2048,createCanvas=()=>document.createElement('canvas')}={}){
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  if(!(width>0&&height>0))return null;
  const scale=Math.min(1,maxSize/Math.max(width,height)),raw=createCanvas();
  raw.width=Math.max(1,Math.round(width*scale));raw.height=Math.max(1,Math.round(height*scale));
  const ctx=raw.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,raw.width,raw.height);
  let crop=normalizeTapeFlatCrop(manualCrop);
  if(!crop)try{crop=detectTapeFlatCrop(ctx.getImageData(0,0,raw.width,raw.height).data,
    raw.width,raw.height,axis);}catch{crop={left:0,top:0,right:1,bottom:1};}
  const left=clamp(Math.floor(crop.left*raw.width),0,raw.width-1),
    top=clamp(Math.floor(crop.top*raw.height),0,raw.height-1),
    right=clamp(Math.ceil(crop.right*raw.width),left+1,raw.width),
    bottom=clamp(Math.ceil(crop.bottom*raw.height),top+1,raw.height),
    canvas=createCanvas();
  canvas.width=right-left;canvas.height=bottom-top;
  const output=canvas.getContext('2d',{willReadFrequently:true});
  output.drawImage(raw,left,top,canvas.width,canvas.height,
    0,0,canvas.width,canvas.height);
  try{
    const pixels=output.getImageData(0,0,canvas.width,canvas.height),bytes=pixels.data;
    const copy=(from,to)=>{for(let k=0;k<4;k++)bytes[to+k]=bytes[from+k];};
    for(let y=0;y<canvas.height;y++){
      let first=-1,last=-1;
      for(let x=0;x<canvas.width;x++)if(bytes[(y*canvas.width+x)*4+3]>=32){
        if(first<0)first=x;last=x;
      }
      if(first<0)continue;
      for(let x=0;x<first;x++)copy((y*canvas.width+first)*4,(y*canvas.width+x)*4);
      for(let x=last+1;x<canvas.width;x++)copy((y*canvas.width+last)*4,(y*canvas.width+x)*4);
    }
    for(let x=0;x<canvas.width;x++){
      let first=-1,last=-1;
      for(let y=0;y<canvas.height;y++)if(bytes[(y*canvas.width+x)*4+3]>=32){
        if(first<0)first=y;last=y;
      }
      if(first<0)continue;
      for(let y=0;y<first;y++)copy((first*canvas.width+x)*4,(y*canvas.width+x)*4);
      for(let y=last+1;y<canvas.height;y++)copy((last*canvas.width+x)*4,(y*canvas.width+x)*4);
    }
    output.putImageData(pixels,0,0);
  }catch{/* Cross-origin previews retain the untouched pixel crop. */}
  return {canvas,crop};
}

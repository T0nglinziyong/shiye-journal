// Keep ChatGPT task packages small without flattening transparent material edges.
// PNG is used because the package must preserve alpha across every material.
export async function offlinePreviewBytes(blob,{maxEdge=640,maxBytes=850_000}={}){
  const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  try{
    let output;
    for(const limit of [maxEdge,512,384]){
      const scale=Math.min(1,limit/Math.max(bitmap.width,bitmap.height));
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      output=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!output)throw Error('无法生成素材预览');
      if(output.size<=maxBytes)break;
    }
    return new Uint8Array(await output.arrayBuffer());
  }finally{bitmap.close();}
}

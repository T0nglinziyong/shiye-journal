// Safari may reject a persisted Blob in createImageBitmap even though its
// bytes can be decoded through an <img>. Never treat a non-Blob as a valid
// persisted source and never upload a replacement just for a preview.
export async function decodeImageBlob(blob,{
 createBitmap=globalThis.createImageBitmap,
 ImageElement=globalThis.Image,
 objectURL=globalThis.URL,
 canvasFactory=()=>document.createElement('canvas')
}={}){
 if(!(blob instanceof Blob)||blob.size<8)
   throw Error('图片原始字节不存在或为空；请检查云端素材是否上传完成');
 if(typeof createBitmap==='function'){
   try{
     const decoded=await createBitmap(blob);
     if(decoded?.width>0&&decoded?.height>0)return decoded;
     decoded?.close?.();
   }catch{/* WebKit supports an alternate HTMLImageElement decode path. */}
 }
 if(typeof ImageElement!=='function'||typeof objectURL?.createObjectURL!=='function')
   throw Error('浏览器无法解码保存的图片；请检查图片格式或重新导入');
 const url=objectURL.createObjectURL(blob);
 try{
   const image=new ImageElement();
   image.decoding='async';
   image.src=url;
   if(typeof image.decode==='function')await image.decode();
   else await new Promise((resolve,reject)=>{
     image.onload=resolve;image.onerror=()=>reject(Error('图片读取失败'));
   });
   const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
   if(!(w>0&&h>0))throw Error('图片尺寸无效');
   const canvas=canvasFactory();
   canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('图片解码画布不可用');
   ctx.drawImage(image,0,0);
   canvas.close=()=>{canvas.width=0;canvas.height=0;};
   return canvas;
 }catch{
   throw Error('保存的图片字节不可解码。可能是离线队列或 COS 原图未完整上传；原记录已保留，请核查云端状态');
 }finally{objectURL.revokeObjectURL(url);}
}

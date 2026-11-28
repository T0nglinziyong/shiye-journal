let decoderPromise;
function decoder(){
  return decoderPromise??=(async()=>{
    const [{default:decode,init},{default:wasmURL}]=await Promise.all([
      import('@jsquash/jpeg/decode.js'),import('@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?url')
    ]);
    init(undefined,{locateFile:()=>wasmURL});
    return decode;
  })();
}

let queue=Promise.resolve();
self.onmessage=({data})=>{
  queue=queue.then(async()=>{
    try{
      const decode=await decoder();
      const image=await decode(data.bytes,{preserveOrientation:true});
      self.postMessage({id:data.id,width:image.width,height:image.height,data:image.data},[image.data.buffer]);
    }catch(error){self.postMessage({id:data.id,error:String(error?.message||error)});}
  });
};

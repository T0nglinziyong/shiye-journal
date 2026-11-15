export function decodeSamMaskBits(encoded,width,height){
  const count=width*height,bytes=Math.ceil(count/8);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||count>20_000_000||
    typeof encoded!=='string'||encoded.length>Math.ceil(bytes/3)*4||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw Error('SAM Mask 数据无效');
  const binary=atob(encoded);
  if(binary.length!==bytes)throw Error('SAM Mask 长度无效');
  const alpha=new Uint8Array(count);
  for(let i=0;i<count;i++)alpha[i]=binary.charCodeAt(i>>3)&(1<<(i&7))?255:0;
  return alpha;
}

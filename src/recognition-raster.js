// The recognition path consumes integer RGBA pixels, never a browser-resized
// image. JPEG decoding is pinned so a shared file enters every device with
// the same pixels; display and export may still use the platform renderer.
import {decode} from './vendor/jpeg-decoder.js';
import {visionTask} from './vision-runtime.js';

export function pixelCanvas(pixels,width,height){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);
  return canvas;
}
export async function decodeRecognitionImage(blob){
  if(blob.type==='image/jpeg'||blob.type==='image/jpg'||/\.jpe?g$/i.test(blob.name||'')){
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const image=decode(bytes,{useTArray:true,maxResolutionInMP:60,maxMemoryUsageInMB:512});
    // Orientation is applied explicitly to raw pixels. Neither EXIF handling
    // nor colour conversion is delegated to the browser image decoder.
    const orientation=jpegOrientation(image.exifBuffer),{data,width,height}=orientPixels(image.data,image.width,image.height,orientation);
    if(hasDisplayP3Profile(bytes))displayP3ToSrgb(data);
    return pixelCanvas(data,width,height);
  }
  return createImageBitmap(blob,{imageOrientation:'from-image',colorSpaceConversion:'none'});
}
// The pinned JPEG decoder yields profile-encoded samples. iPhone photos often
// carry Display P3; putImageData otherwise labels those samples as sRGB.
export function hasDisplayP3Profile(bytes){
  for(let p=2;p+4<bytes.length&&bytes[p]===255;){
    const marker=bytes[p+1];if(marker===0xda||marker===0xd9)break;
    if(marker===0x01||marker>=0xd0&&marker<=0xd7){p+=2;continue;}
    const size=(bytes[p+2]<<8)|bytes[p+3];if(size<2||p+2+size>bytes.length)break;
    if(marker===0xe2){
      const segment=bytes.subarray(p+4,p+2+size);
      const header='ICC_PROFILE\0';
      if(header.split('').every((c,i)=>segment[i]===c.charCodeAt(0))){
        const label='Display P3';
        for(let i=14;i+label.length*2<=segment.length;i++)if(label.split('').every((c,j)=>segment[i+j*2]===0&&segment[i+j*2+1]===c.charCodeAt(0)))return true;
      }
    }
    p+=size+2;
  }
  return false;
}
export function displayP3ToSrgb(pixels){
  const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
  const encode=v=>Math.round(255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055));
  for(let i=0;i<pixels.length;i+=4){
    const r=linear(pixels[i]),g=linear(pixels[i+1]),b=linear(pixels[i+2]);
    pixels[i]=encode(1.224940176*r-.224940176*g);
    pixels[i+1]=encode(-.042056955*r+1.042056955*g);
    pixels[i+2]=encode(-.019637554*r-.078636046*g+1.098273600*b);
  }
}
function jpegOrientation(exif){
  if(!exif)return 1;
  const b=new DataView(exif.buffer,exif.byteOffset,exif.byteLength);
  let start=exif[0]===0&&(exif[1]===0x49||exif[1]===0x4d)?1:0;
  if(exif.length>=6&&String.fromCharCode(...exif.slice(0,4))==='Exif')start=6;
  if(b.byteLength<start+8)return 1;
  const order=b.getUint16(start),little=order===0x4949;
  if(!little&&order!==0x4d4d)return 1;
  if(b.getUint16(start+2,little)!==42)return 1;
  const offset=start+b.getUint32(start+4,little);
  if(offset+2>b.byteLength)return 1;
  const count=b.getUint16(offset,little);
  for(let i=0;i<count&&offset+2+i*12+12<=b.byteLength;i++){
    const at=offset+2+i*12;
    if(b.getUint16(at,little)===0x112&&b.getUint16(at+2,little)===3&&b.getUint32(at+4,little)===1){
      const value=b.getUint16(at+8,little);return value>=1&&value<=8?value:1;
    }
  }
  return 1;
}
function orientPixels(pixels,width,height,orientation){
  if(orientation===1)return {data:pixels,width,height};
  const swapped=orientation>=5,ow=swapped?height:width,oh=swapped?width:height,out=new Uint8ClampedArray(pixels.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let tx=x,ty=y;
    switch(orientation){
      case 2:tx=width-1-x;break;
      case 3:tx=width-1-x;ty=height-1-y;break;
      case 4:ty=height-1-y;break;
      case 5:tx=y;ty=x;break;
      case 6:tx=height-1-y;ty=x;break;
      case 7:tx=height-1-y;ty=width-1-x;break;
      case 8:tx=y;ty=width-1-x;break;
    }
    out.set(pixels.subarray((y*width+x)*4,(y*width+x+1)*4),(ty*ow+tx)*4);
  }
  return {data:out,width:ow,height:oh};
}
export function sourcePixels(source){
  const canvas=source instanceof HTMLCanvasElement?source:document.createElement('canvas');
  if(canvas!==source){canvas.width=source.width;canvas.height=source.height;canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'}).drawImage(source,0,0);}
  return canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'}).getImageData(0,0,canvas.width,canvas.height).data;
}
export async function analysisPixels(source,box,width,height){
  const pixels=sourcePixels(source),x=Math.round(source.width*box.x),y=Math.round(source.height*box.y),
    cropWidth=Math.max(1,Math.min(source.width-x,Math.round(source.width*box.w))),
    cropHeight=Math.max(1,Math.min(source.height-y,Math.round(source.height*box.h)));
  if(x===0&&y===0&&cropWidth===source.width&&cropHeight===source.height&&width===source.width&&height===source.height)
    return pixels;
  return (await visionTask('resize',{pixels,transferInput:true,sourceWidth:source.width,sourceHeight:source.height,x,y,cropWidth,cropHeight,width,height})).pixels;
}

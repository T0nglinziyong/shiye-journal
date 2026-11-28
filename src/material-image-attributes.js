import {decodeImageBlob} from './image-blob-decoder.js';

export async function materialImageAttributes(blob,{decode=decodeImageBlob,createCanvas=()=>document.createElement('canvas')}={}){
  const bitmap=await decode(blob);
  try{
    const width=bitmap.width,height=bitmap.height,scale=Math.min(1,256/Math.max(width,height));
    const canvas=createCanvas();
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const data=context.getImageData(0,0,canvas.width,canvas.height).data;
    const w=canvas.width,h=canvas.height,bins=new Map();
    let area=0,alphaSum=0,cx=0,cy=0,perimeter=0,laplaceSum=0,laplaceSquare=0,sharpPixels=0;
    let minX=w,minY=h,maxX=-1,maxY=-1;
    const alpha=(x,y)=>x<0||y<0||x>=w||y>=h?0:data[(y*w+x)*4+3];
    const luminance=(x,y)=>{const p=(y*w+x)*4;return .2126*data[p]+.7152*data[p+1]+.0722*data[p+2];};
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4,a=data[i+3];if(a<32)continue;
      area++;alphaSum+=a/255;cx+=(x+.5)*a;cy+=(y+.5)*a;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      if(alpha(x-1,y)<32)perimeter++;if(alpha(x+1,y)<32)perimeter++;
      if(alpha(x,y-1)<32)perimeter++;if(alpha(x,y+1)<32)perimeter++;
      if(a>=180){const key=((data[i]>>5)<<6)|((data[i+1]>>5)<<3)|(data[i+2]>>5);
        bins.set(key,(bins.get(key)||0)+1);}
      if(x>0&&y>0&&x<w-1&&y<h-1&&
        alpha(x-1,y)>180&&alpha(x+1,y)>180&&alpha(x,y-1)>180&&alpha(x,y+1)>180){
        const lap=4*luminance(x,y)-luminance(x-1,y)-luminance(x+1,y)-
          luminance(x,y-1)-luminance(x,y+1);
        laplaceSum+=lap;laplaceSquare+=lap*lap;sharpPixels++;
      }
    }
    const hex=key=>[key>>6&7,key>>3&7,key&7].map(channel=>(channel*32+16).toString(16).padStart(2,'0')).join('');
    const colors=[...bins].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([key])=>'#'+hex(key));
    const mean=sharpPixels?laplaceSum/sharpPixels:0;
    return {pixelWidth:width,pixelHeight:height,aspectRatio:width/height,fileSizeBytes:blob.size,
      alphaCoverage:area/(w*h),opacityMean:area?alphaSum/area:0,
      visualBoundsRatio:area?[minX/w,minY/h,(maxX+1)/w,(maxY+1)/h]:null,
      visualCenter:area?{x:cx/(alphaSum*255*w),y:cy/(alphaSum*255*h)}:null,
      contourComplexity:area?perimeter/Math.sqrt(area):null,
      sharpness:sharpPixels?Math.max(0,laplaceSquare/sharpPixels-mean*mean):null,
      primaryColorHex:colors[0]||null,secondaryColorHex:colors.slice(1),
      cutoutState:'mask_applied',imageState:'derived'};
  }finally{bitmap.close?.();}
}

export function paintMask(mask,width,height,points,ratio,restore,sourceAlpha=null){
  const out=new Uint8ClampedArray(mask),radius=Math.max(1,Math.min(width,height)*ratio/2);
  for(const p of points){const cx=p.x*width,cy=p.y*height;for(let y=Math.max(0,Math.floor(cy-radius-1));y<Math.min(height,Math.ceil(cy+radius+1));y++)for(let x=Math.max(0,Math.floor(cx-radius-1));x<Math.min(width,Math.ceil(cx+radius+1));x++){const coverage=Math.max(0,Math.min(1,radius+.5-Math.hypot(x+.5-cx,y+.5-cy))),i=y*width+x;if(!coverage)continue;const target=restore?(sourceAlpha?.[i]??255):0;out[i]=out[i]*(1-coverage)+target*coverage;}}return out;
}
export function maskOrientation(mask,width,height){
  let n=0,x=0,y=0,xx=0,yy=0,xy=0;const stride=Math.max(1,Math.floor(Math.max(width,height)/600));
  for(let py=0;py<height;py+=stride)for(let px=0;px<width;px+=stride){if(mask[py*width+px]<128)continue;n++;x+=px;y+=py;xx+=px*px;yy+=py*py;xy+=px*py;}
  if(n<10)return null;const a=xx/n-(x/n)**2,b=yy/n-(y/n)**2,c=xy/n-x*y/n**2;let degrees=Math.atan2(2*c,a-b)*90/Math.PI;while(degrees>45)degrees-=90;while(degrees<-45)degrees+=90;return -degrees;
}
export function refineMaskStroke(mask,image,stroke){
  const {width:w,height:h,data}=image,samples=[[],[],[]];for(let y=0;y<h;y+=Math.max(1,Math.floor(h/40)))for(let x=0;x<w;x+=Math.max(1,Math.floor(w/40))){if(x>w*.08&&x<w*.92&&y>h*.08&&y<h*.92)continue;const i=(y*w+x)*4;for(let k=0;k<3;k++)samples[k].push(data[i+k]);}
  const bg=samples.map(a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)]||255),out=new Uint8ClampedArray(mask),radius=Math.min(w,h)*stroke.ratio*.75;let changed=0;
  for(const p of stroke.points)for(let y=Math.max(0,Math.floor(p.y*h-radius));y<Math.min(h,p.y*h+radius);y++)for(let x=Math.max(0,Math.floor(p.x*w-radius));x<Math.min(w,p.x*w+radius);x++){if(Math.hypot(x-p.x*w,y-p.y*h)>radius)continue;const i=y*w+x,distance=Math.max(...bg.map((b,k)=>Math.abs(data[i*4+k]-b)));const target=distance>25?255:distance<10?0:out[i];if(target!==out[i]){out[i]=target;changed++;}}
  return {mask:out,changed};
}

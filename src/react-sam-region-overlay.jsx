import React,{useLayoutEffect,useRef} from 'react';

const color=index=>{
  const hue=(index*137.508)%360;
  return `hsl(${hue} 78% 46%)`;
};

export function SamRegionOverlay({previewRef,regions,frameSize,mode,selected,onRegionClick}){
  const canvasRef=useRef(null);
  const selectionKey=[...(selected||[])].sort((a,b)=>a-b).join(',');
  useLayoutEffect(()=>{
    const host=previewRef.current,canvas=canvasRef.current;
    if(!host||!canvas||!regions.length)return;
    const sourceWidth=frameSize?.width||regions[0].segmentationFrameWidth||1024;
    const sourceHeight=frameSize?.height||regions[0].segmentationFrameHeight||
      Math.round(sourceWidth*host.clientHeight/host.clientWidth);
    const frameScale=Math.min(1,1200/Math.max(sourceWidth,sourceHeight));
    const frameWidth=Math.max(1,Math.round(sourceWidth*frameScale));
    const frameHeight=Math.max(1,Math.round(sourceHeight*frameScale));
    const paint=()=>{
      const width=host.clientWidth,height=host.clientHeight;
      if(!width||!height)return;
      const scale=Math.min(width/frameWidth,height/frameHeight);
      Object.assign(canvas.style,{width:`${frameWidth*scale}px`,height:`${frameHeight*scale}px`,
        left:`${(width-frameWidth*scale)/2}px`,top:`${(height-frameHeight*scale)/2}px`});
      canvas.width=frameWidth;canvas.height=frameHeight;
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,frameWidth,frameHeight);
      regions.forEach((region,index)=>{
        const x=Math.round(region.x*frameWidth),y=Math.round(region.y*frameHeight);
        const w=Math.round(region.w*frameWidth),h=Math.round(region.h*frameHeight);
        const chosen=selected?.has(index);
        if(mode==='regions'&&region.mask?.alpha){
          const mask=region.mask,layer=document.createElement('canvas');
          layer.width=mask.width;layer.height=mask.height;
          const layerContext=layer.getContext('2d'),pixels=layerContext.createImageData(mask.width,mask.height);
          const hue=(index*137.508)%360;
          // Fixed saturation/value keeps adjacent regions distinguishable.
          const rgb=hslToRgb(hue/360,.78,.46);
          for(let at=0;at<mask.alpha.length;at++){
            const to=at*4;pixels.data[to]=rgb[0];pixels.data[to+1]=rgb[1];pixels.data[to+2]=rgb[2];
            pixels.data[to+3]=mask.alpha[at]?(chosen?175:105):0;
          }
          layerContext.putImageData(pixels,0,0);ctx.drawImage(layer,x,y,w,h);
        }
        ctx.strokeStyle=chosen?'#fff':color(index);ctx.lineWidth=chosen?5:3;
        ctx.strokeRect(x+.5,y+.5,w,h);
        ctx.fillStyle=color(index);ctx.fillRect(x,y,30,26);
        ctx.fillStyle='#fff';ctx.font='bold 17px sans-serif';ctx.fillText(String(index+1),x+6,y+19);
      });
    };
    paint();const observer=new ResizeObserver(paint);observer.observe(host);
    return ()=>observer.disconnect();
  },[previewRef,regions,frameSize,mode,selectionKey]);
  const click=event=>{
    const rect=event.currentTarget.getBoundingClientRect();
    const x=(event.clientX-rect.left)*event.currentTarget.width/rect.width;
    const y=(event.clientY-rect.top)*event.currentTarget.height/rect.height;
    for(let index=regions.length-1;index>=0;index--){
      const region=regions[index],rx=x/event.currentTarget.width,ry=y/event.currentTarget.height;
      if(rx<region.x||ry<region.y||rx>=region.x+region.w||ry>=region.y+region.h)continue;
      if(mode==='regions'&&region.mask?.alpha){
        const mx=Math.floor((rx-region.x)/region.w*region.mask.width);
        const my=Math.floor((ry-region.y)/region.h*region.mask.height);
        if(region.mask.alpha[my*region.mask.width+mx]<20)continue;
      }
      onRegionClick(index);return;
    }
  };
  return <canvas ref={canvasRef} className="sam-region-overlay" onClick={click}
    role="img" aria-label={mode==='regions'?'彩色分割区域，可点选':'候选框，可点选'}/>;
}

function hslToRgb(h,s,l){
  const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);
    return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));};
  return [f(0),f(8),f(4)];
}

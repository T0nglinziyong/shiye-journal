import React,{useLayoutEffect,useRef} from 'react';
import Panzoom from '@panzoom/panzoom';
import {clampedCanvasOffset} from './canvas-control-behavior.js';

// This adapter changes only the fitted paper's CSS transform. Fabric keeps
// its own scene coordinates and pointer lifetime, so zoom never edits Scene.
export function FabricPageViewport({draft,width,height,zoom=1,initialPan,onViewportChange,children}){
  const pageRef=useRef(null),panRef=useRef(null),changeRef=useRef(onViewportChange);
  changeRef.current=onViewportChange;
  useLayoutEffect(()=>{
    const page=pageRef.current,host=page.parentElement;
    const center=()=>{
      page.style.marginLeft=Math.max(0,(host.clientWidth-page.clientWidth)/2)+'px';
      page.style.marginTop=Math.max(0,(host.clientHeight-page.clientHeight)/2)+'px';
    };
    host.style.alignItems='flex-start';host.style.justifyContent='flex-start';
    center();
    const pan=Panzoom(page,{noBind:true,minScale:1,maxScale:4,
      startScale:Math.max(1,Math.min(4,zoom)),startX:initialPan?.x||0,startY:initialPan?.y||0,
      pinchAndPan:true,canvas:true,
      cursor:'',touchAction:'none',handleStartEvent:event=>event.preventDefault()});
    panRef.current=pan;
    const active=new Map();let navigating=false,mousePan=false,clampFrame=0;
    const stop=event=>{event.preventDefault();event.stopImmediatePropagation();};
    const clamp=()=>{
      clampFrame=0;if(!page.isConnected)return;
      const box=page.getBoundingClientRect(),bounds=host.getBoundingClientRect();
      const dx=clampedCanvasOffset(box.left,box.right,bounds.left,bounds.right),
        dy=clampedCanvasOffset(box.top,box.bottom,bounds.top,bounds.bottom);
      if(Math.abs(dx)+Math.abs(dy)<.5)return;
      const offset=pan.getPan(),scale=pan.getScale();
      pan.pan(offset.x+dx/scale,offset.y+dy/scale,{force:true,animate:false});
    };
    const scheduleClamp=()=>{if(!clampFrame)clampFrame=requestAnimationFrame(clamp);};
    const changed=()=>{changeRef.current?.(pan.getScale(),pan.getPan());scheduleClamp();};
    const down=event=>{
      if(event.pointerType==='touch'){
        active.set(event.pointerId,event);
        if(active.size<2)return;
        if(!navigating){
          // The first finger may have started ink. Cancel that preview before
          // giving both contacts to Panzoom; a pinch must not save a stroke.
          const first=[...active.values()][0];
          page.querySelector('.upper-canvas')?.dispatchEvent(new PointerEvent('pointercancel',{
            bubbles:true,pointerId:first.pointerId,pointerType:'touch',
            clientX:first.clientX,clientY:first.clientY}));
          pan.handleDown(first);navigating=true;
        }
        pan.handleDown(event);
        try{host.setPointerCapture(event.pointerId);}catch{}
        stop(event);
      }else if(event.button===1){
        mousePan=true;navigating=true;pan.handleDown(event);
        try{host.setPointerCapture(event.pointerId);}catch{}
        stop(event);
      }
    };
    const move=event=>{
      if(active.has(event.pointerId))active.set(event.pointerId,event);
      if(!navigating)return;
      pan.handleMove(event);stop(event);
    };
    const end=event=>{
      active.delete(event.pointerId);
      if(!navigating)return;
      pan.handleUp(event);stop(event);
      if(mousePan||active.size===0){mousePan=false;navigating=false;}
    };
    const wheel=event=>{
      if(!event.ctrlKey&&!event.metaKey)return;
      event.preventDefault();pan.zoomWithWheel(event);event.stopImmediatePropagation();
    };
    const observer=new ResizeObserver(()=>{center();scheduleClamp();});observer.observe(host);
    host.addEventListener('pointerdown',down,true);
    host.addEventListener('pointermove',move,true);
    host.addEventListener('pointerup',end,true);
    host.addEventListener('pointercancel',end,true);
    host.addEventListener('wheel',wheel,{passive:false,capture:true});
    page.addEventListener('panzoomchange',changed);
    scheduleClamp();
    return ()=>{
      observer.disconnect();cancelAnimationFrame(clampFrame);pan.destroy();panRef.current=null;
      host.removeEventListener('pointerdown',down,true);
      host.removeEventListener('pointermove',move,true);
      host.removeEventListener('pointerup',end,true);
      host.removeEventListener('pointercancel',end,true);
      host.removeEventListener('wheel',wheel,true);
      page.removeEventListener('panzoomchange',changed);
    };
  },[draft.id]);
  useLayoutEffect(()=>{
    const pan=panRef.current;
    if(pan&&Math.abs(pan.getScale()-zoom)>.001)pan.zoom(zoom,{animate:false});
  },[zoom]);
  return <div ref={pageRef} id="canvas-page" className={`canvas-page ${draft.paperPattern}`}
    style={{width,height,backgroundColor:draft.paperColor,flex:'0 0 auto',flexShrink:0}}>{children}</div>;
}

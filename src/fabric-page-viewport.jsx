import React,{useLayoutEffect,useRef} from 'react';
import Panzoom from '@panzoom/panzoom';
import {clampedCanvasOffset,fingerNavigatesCanvas,isIPadPointerDevice} from './canvas-control-behavior.js';

// This adapter changes only the fitted paper's CSS transform. Fabric keeps
// its own scene coordinates and pointer lifetime, so zoom never edits Scene.
export function FabricPageViewport({draft,width,height,zoom=1,initialPan,onViewportChange,
  onCanvasTap,canTransform,tool='select',resetSignal=0,children}){
  const pageRef=useRef(null),panRef=useRef(null),changeRef=useRef(onViewportChange),
    tapRef=useRef(onCanvasTap),transformRef=useRef(canTransform),toolRef=useRef(tool),previousZoom=useRef(zoom);
  changeRef.current=onViewportChange;
  tapRef.current=onCanvasTap;transformRef.current=canTransform;toolRef.current=tool;
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
    const active=new Map(),starts=new Map();let navigating=false,mousePan=false,clampFrame=0,clamping=false;
    const iPad=isIPadPointerDevice(navigator);
    const stop=event=>{event.preventDefault();event.stopImmediatePropagation();};
    const clamp=()=>{
      if(!page.isConnected||clamping)return false;
      const box=page.getBoundingClientRect(),bounds=host.getBoundingClientRect();
      const dx=clampedCanvasOffset(box.left,box.right,bounds.left,bounds.right),
        dy=clampedCanvasOffset(box.top,box.bottom,bounds.top,bounds.bottom);
      if(Math.abs(dx)+Math.abs(dy)<.5)return false;
      const offset=pan.getPan(),scale=pan.getScale();
      clamping=true;
      try{pan.pan(offset.x+dx/scale,offset.y+dy/scale,{force:true,animate:false});}
      finally{clamping=false;}
      return true;
    };
    // Panzoom publishes its event before every browser has painted the new
    // transform. Recheck on following frames until the paper is actually
    // inside the viewport, then persist only the settled position.
    const settleClamp=()=>{
      clampFrame=0;
      if(clamp()){scheduleClamp();return;}
      changeRef.current?.(pan.getScale(),pan.getPan());
    };
    const scheduleClamp=()=>{if(!clampFrame)clampFrame=requestAnimationFrame(settleClamp);};
    const changed=()=>scheduleClamp();
    const down=event=>{
      const fingerPan=fingerNavigatesCanvas({pointerType:event.pointerType,
        tool:toolRef.current,iPad});
      if(fingerPan||toolRef.current==='select'&&
        (event.pointerType==='touch'||event.pointerType==='mouse'&&event.button===0)){
        // The first tap selects only after release. A later gesture starting
        // on that selected object is handled by Fabric's transform controls.
        if(transformRef.current?.(event))return;
        if(event.pointerType==='touch')active.set(event.pointerId,event);
        if(active.size>1)for(const start of starts.values())start.moved=true;
        starts.set(event.pointerId,{x:event.clientX,y:event.clientY,moved:active.size>1});
        navigating=true;mousePan=event.pointerType==='mouse';
        pan.handleDown(event);
        try{host.setPointerCapture(event.pointerId);}catch{}
        stop(event);return;
      }
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
      const start=starts.get(event.pointerId);
      if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)start.moved=true;
      if(!navigating)return;
      pan.handleMove(event);stop(event);
    };
    const end=event=>{
      active.delete(event.pointerId);
      const start=starts.get(event.pointerId);starts.delete(event.pointerId);
      if(!navigating)return;
      pan.handleUp(event);stop(event);
      if(start&&!start.moved&&event.type==='pointerup'&&active.size===0&&
        Math.hypot(event.clientX-start.x,event.clientY-start.y)<=5)tapRef.current?.(event);
      if(mousePan||active.size===0){mousePan=false;navigating=false;}
      scheduleClamp();
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
    if(pan&&Math.abs(pan.getScale()-zoom)>.001){
      if(zoom<=1&&previousZoom.current>1)pan.reset({startX:0,startY:0,startScale:1,animate:false});
      else pan.zoom(zoom,{animate:false});
    }
    previousZoom.current=zoom;
  },[zoom]);
  useLayoutEffect(()=>{
    if(resetSignal)panRef.current?.reset({startX:0,startY:0,startScale:1,animate:false});
  },[resetSignal]);
  return <div ref={pageRef} id="canvas-page" className={`canvas-page ${draft.paperPattern}`}
    style={{width,height,backgroundColor:draft.paperColor,flex:'0 0 auto',flexShrink:0}}>{children}</div>;
}

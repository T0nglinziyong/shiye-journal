import React,{useLayoutEffect,useRef} from 'react';
import {boundedCanvasViewport,fingerNavigatesCanvas,isIPadPointerDevice} from './canvas-control-behavior.js';

// Constrain the proposed transform before painting it. No out-of-bounds frame
// or delayed correction is ever sent to CSS, including during a pinch.
export function FabricPageViewport({draft,width,height,zoom=1,initialPan,onViewportChange,
  onCanvasTap,canTransform,tool='select',resetSignal=0,children}){
  const pageRef=useRef(null),controller=useRef(null),latest=useRef(null);
  latest.current={onViewportChange,onCanvasTap,canTransform,tool};
  useLayoutEffect(()=>{
    const page=pageRef.current,host=page.parentElement;
    host.style.alignItems='flex-start';host.style.justifyContent='flex-start';
    page.style.transformOrigin='center center';page.style.touchAction='none';
    const active=new Map(),starts=new Map();
    let cancelingInk=false;
    let pose={scale:zoom,x:initialPan?.x||0,y:initialPan?.y||0};
    const paint=next=>{
      const w=host.clientWidth,h=host.clientHeight,pw=page.offsetWidth,ph=page.offsetHeight;
      pose=boundedCanvasViewport(next,{width:pw,height:ph,hostWidth:w,hostHeight:h});
      page.style.marginLeft=(w-pw)/2+'px';page.style.marginTop=(h-ph)/2+'px';
      page.style.transition='none';
      page.style.transform=`translate(${pose.x*pose.scale}px,${pose.y*pose.scale}px) scale(${pose.scale})`;
      latest.current.onViewportChange?.(pose.scale,{x:pose.x,y:pose.y});
      page.dispatchEvent(new CustomEvent('panzoomchange',{detail:pose}));
    };
    const zoomAt=(scale,cx=host.clientWidth/2,cy=host.clientHeight/2)=>{
      scale=Math.max(1,Math.min(4,scale));
      const dx=cx-host.clientWidth/2,dy=cy-host.clientHeight/2;
      paint({scale,x:pose.x+dx/scale-dx/pose.scale,y:pose.y+dy/scale-dy/pose.scale});
    };
    controller.current={zoom:scale=>zoomAt(scale),reset:()=>paint({scale:1,x:0,y:0})};
    const stop=event=>{event.preventDefault();event.stopImmediatePropagation();};
    const iPad=isIPadPointerDevice(navigator);
    const down=event=>{
      const mode=latest.current.tool;
      if(event.pointerType==='pen'&&mode!=='select')return;
      const navigate=fingerNavigatesCanvas({pointerType:event.pointerType,tool:mode,iPad})||
        mode==='select'&&(event.pointerType==='touch'||event.button===0)||event.button===1;
      if(!navigate&&event.pointerType!=='touch')return;
      if(!active.size&&navigate&&event.button!==1&&latest.current.canTransform?.(event)){
        if(event.pointerType==='touch'){
          active.set(event.pointerId,{x:event.clientX,y:event.clientY,navigate:false});
          starts.set(event.pointerId,{x:event.clientX,y:event.clientY,moved:true});
        }
        return;
      }
      active.set(event.pointerId,{x:event.clientX,y:event.clientY,navigate});
      starts.set(event.pointerId,{x:event.clientX,y:event.clientY,moved:false});
      if(!navigate&&active.size<2)return;
      if(active.size>1){
        for(const start of starts.values())start.moved=true;
        for(const [id,p] of active){
          if(!p.navigate){
            cancelingInk=true;
            try{page.querySelector('.upper-canvas')?.dispatchEvent(new PointerEvent('pointercancel',{
              bubbles:true,pointerId:id,pointerType:'touch',clientX:p.x,clientY:p.y}));}
            finally{cancelingInk=false;}
          }
          p.navigate=true;
        }
      }
      try{host.setPointerCapture(event.pointerId);}catch{}
      stop(event);
    };
    const move=event=>{
      const old=active.get(event.pointerId);if(!old)return;
      const before=[...active.values()].map(p=>({...p}));
      const start=starts.get(event.pointerId);
      if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)start.moved=true;
      const next={...old,x:event.clientX,y:event.clientY};active.set(event.pointerId,next);
      if(!old.navigate)return;
      if(active.size===1){
        if(start?.moved&&event.pointerType!=='pen')paint({...pose,x:pose.x+(next.x-old.x)/pose.scale,y:pose.y+(next.y-old.y)/pose.scale});
      }else{
        const after=[...active.values()],mid=a=>({x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}),
          distance=a=>Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),a=mid(before),b=mid(after),
          bounds=host.getBoundingClientRect(),scale=Math.max(1,Math.min(4,pose.scale*distance(after)/Math.max(1,distance(before))));
        const ax=a.x-bounds.left-host.clientWidth/2,ay=a.y-bounds.top-host.clientHeight/2,
          bx=b.x-bounds.left-host.clientWidth/2,by=b.y-bounds.top-host.clientHeight/2;
        paint({scale,x:pose.x+bx/scale-ax/pose.scale,y:pose.y+by/scale-ay/pose.scale});
      }
      stop(event);
    };
    const end=event=>{
      if(cancelingInk)return;
      const p=active.get(event.pointerId),start=starts.get(event.pointerId);
      active.delete(event.pointerId);starts.delete(event.pointerId);
      if(!p?.navigate)return;
      stop(event);
      if(start&&!start.moved&&event.type==='pointerup'&&!active.size&&event.button!==1)
        latest.current.onCanvasTap?.(event);
    };
    const wheel=event=>{if(!event.ctrlKey&&!event.metaKey)return;stop(event);
      const bounds=host.getBoundingClientRect();zoomAt(pose.scale*Math.exp(-event.deltaY*.002),event.clientX-bounds.left,event.clientY-bounds.top);};
    const observer=new ResizeObserver(()=>paint(pose));observer.observe(host);observer.observe(page);
    host.addEventListener('pointerdown',down,true);host.addEventListener('pointermove',move,true);
    host.addEventListener('pointerup',end,true);host.addEventListener('pointercancel',end,true);
    host.addEventListener('wheel',wheel,{passive:false,capture:true});paint(pose);
    return ()=>{observer.disconnect();controller.current=null;
      host.removeEventListener('pointerdown',down,true);host.removeEventListener('pointermove',move,true);
      host.removeEventListener('pointerup',end,true);host.removeEventListener('pointercancel',end,true);
      host.removeEventListener('wheel',wheel,true);};
  },[draft.id]);
  useLayoutEffect(()=>{controller.current?.zoom(zoom);},[zoom]);
  useLayoutEffect(()=>{if(resetSignal)controller.current?.reset();},[resetSignal]);
  return <div ref={pageRef} id="canvas-page" className={`canvas-page ${draft.paperPattern}`}
    style={{width,height,backgroundColor:draft.paperColor,flex:'0 0 auto',flexShrink:0}}>{children}</div>;
}

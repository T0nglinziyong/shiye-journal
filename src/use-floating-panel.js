import {useEffect,useRef,useState} from 'react';

const margin=8;
const viewport=()=>({width:window.innerWidth,
  height:window.visualViewport?.height||window.innerHeight});
const clamp=(value,min,max)=>Math.max(min,Math.min(value,Math.max(min,max)));

// Move and height-resize use the same pointer geometry for the scissors and
// object inspector. Keep all pointer updates inside the panel's React subtree.
export function useFloatingPanel(minHeight=190){
  const panel=useRef(null),gesture=useRef(null),latest=useRef(null);
  const [geometry,setGeometry]=useState(null);
  const commit=next=>{latest.current=next;setGeometry(next);};
  const fit=next=>{
    const size=viewport(),width=panel.current?.offsetWidth||300;
    const height=clamp(next.height,minHeight,size.height-margin*2);
    return {left:clamp(next.left,margin,size.width-width-margin),
      top:clamp(next.top,margin,size.height-height-margin),height};
  };
  useEffect(()=>{
    const resize=()=>{if(latest.current)commit(fit(latest.current));};
    window.addEventListener('resize',resize);
    window.visualViewport?.addEventListener('resize',resize);
    return ()=>{window.removeEventListener('resize',resize);
      window.visualViewport?.removeEventListener('resize',resize);};
  },[]);
  const begin=(event,kind)=>{
    if(event.button>0||kind==='move'&&event.target.closest('button,input,select,textarea'))return;
    const rect=panel.current?.getBoundingClientRect();if(!rect)return;
    gesture.current={kind,id:event.pointerId,x:event.clientX,y:event.clientY,
      left:rect.left,top:rect.top,height:rect.height};
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();event.stopPropagation();
  };
  const move=event=>{
    const start=gesture.current;if(!start||start.id!==event.pointerId)return;
    if(start.kind==='move')commit(fit({left:start.left+event.clientX-start.x,
      top:start.top+event.clientY-start.y,height:start.height}));
    else{
      const size=viewport();
      const height=clamp(start.height+event.clientY-start.y,minHeight,size.height-margin*2);
      commit(fit({left:start.left,
        top:Math.min(start.top,size.height-height-margin),height}));
    }
    event.preventDefault();event.stopPropagation();
  };
  const end=event=>{if(gesture.current?.id===event.pointerId)gesture.current=null;};
  const resizeBy=delta=>{
    const rect=panel.current?.getBoundingClientRect();if(!rect)return;
    const size=viewport(),height=clamp(rect.height+delta,minHeight,size.height-margin*2);
    commit(fit({left:rect.left,top:Math.min(rect.top,size.height-height-margin),height}));
  };
  return {panel,style:geometry?{left:geometry.left,top:geometry.top,
    right:'auto',bottom:'auto',height:geometry.height}:undefined,
    moveProps:{onPointerDown:event=>begin(event,'move'),onPointerMove:move,
      onPointerUp:end,onPointerCancel:end},
    resizeProps:{onPointerDown:event=>begin(event,'resize'),onPointerMove:move,
      onPointerUp:end,onPointerCancel:end,
      onKeyDown:event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();resizeBy(event.key==='ArrowDown'?20:-20);
      }}}};
}

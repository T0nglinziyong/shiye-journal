import React,{useLayoutEffect,useRef,useState} from 'react';

const initialCorners=()=>[{x:.03,y:.03},{x:.97,y:.03},{x:.97,y:.97},{x:.03,y:.97}];
const bounded=value=>Math.max(.004,Math.min(.996,value));
export function PaperCorrection({state,previewRef,onChange}){
  const bitmap=state.importBitmap;
  const [corners,setCorners]=useState(()=>{
    state.paperCorners||=initialCorners();return state.paperCorners.map(point=>({...point}));
  });
  const [rect,setRect]=useState({left:0,top:0,width:1,height:1});
  const overlay=useRef(null),gesture=useRef(null),cornersRef=useRef(corners);
  cornersRef.current=corners;
  useLayoutEffect(()=>{
    const host=previewRef.current;if(!host||!bitmap)return;
    const position=()=>{
      const factor=Math.min(host.clientWidth/bitmap.width,host.clientHeight/bitmap.height);
      const width=bitmap.width*factor,height=bitmap.height*factor;
      setRect({left:(host.clientWidth-width)/2,top:(host.clientHeight-height)/2,width,height});
    };
    const observer=new ResizeObserver(position);observer.observe(host);
    const image=host.querySelector(':scope > img');image?.addEventListener('load',position);
    position();return ()=>{observer.disconnect();image?.removeEventListener('load',position);};
  },[previewRef,bitmap]);
  const start=(event,index)=>{
    event.preventDefault();event.stopPropagation();
    const button=event.currentTarget;button.setPointerCapture(event.pointerId);
    gesture.current={id:event.pointerId,index,start:{...cornersRef.current[index]},x:event.clientX,y:event.clientY};
  };
  const move=event=>{
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;
    const bounds=overlay.current.getBoundingClientRect();
    const next=cornersRef.current.map(point=>({...point}));
    next[g.index]={x:bounded(g.start.x+(event.clientX-g.x)/bounds.width),
      y:bounded(g.start.y+(event.clientY-g.y)/bounds.height)};
    cornersRef.current=next;setCorners(next);state.paperCorners=next;
    state.paperPreviewApplied=false;
  };
  const end=event=>{if(gesture.current?.id!==event.pointerId)return;gesture.current=null;onChange();};
  const cancel=event=>{
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;
    const next=cornersRef.current.map(point=>({...point}));next[g.index]=g.start;
    cornersRef.current=next;setCorners(next);state.paperCorners=next;gesture.current=null;onChange();
  };
  const labels=['左上','右上','右下','左下'];
  return <div ref={overlay} className="paper-corner-overlay" style={rect}>
    <svg viewBox={`0 0 ${rect.width} ${rect.height}`}><polygon points={corners.map(p=>`${p.x*rect.width},${p.y*rect.height}`).join(' ')}/></svg>
    {corners.map((point,index)=><button key={index} type="button" className="paper-handle" data-corner={index}
      aria-label={`${labels[index]}角`} style={{left:Math.max(15,Math.min(rect.width-15,point.x*rect.width)),
        top:Math.max(15,Math.min(rect.height-15,point.y*rect.height))}}
      onPointerDown={event=>start(event,index)} onPointerMove={move} onPointerUp={end}
      onPointerCancel={cancel}>{index+1}</button>)}
  </div>;
}

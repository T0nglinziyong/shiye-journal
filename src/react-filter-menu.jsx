import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {popupPlacement} from './popover-placement.js';

export function ReactFilterMenu({heading,glyph,options,value,onChange,toggle=false}){
  const anchor=useRef(null),[open,setOpen]=useState(false),[position,setPosition]=useState(null);
  const label=options.find(option=>option[0]===value)?.[1]||'';
  const reserve=options.reduce((longest,option)=>option[1].length>longest.length?option[1]:longest,'');
  useEffect(()=>{
    if(!open)return;
    const reposition=()=>{
      const rect=anchor.current?.getBoundingClientRect();
      if(!rect)return;
      const width=Math.min(250,innerWidth-24),height=Math.min(options.length*42+16,innerHeight*.75);
      const placed=popupPlacement({anchor:rect,viewportWidth:innerWidth,viewportHeight:innerHeight,
        popupWidth:width,popupHeight:height,picker:false});
      setPosition({left:placed.left,top:placed.top,width,maxHeight:placed.maxHeight});
    };
    const outside=event=>{
      if(anchor.current?.contains(event.target)||event.target.closest?.('[data-react-filter-menu]'))return;
      setOpen(false);
    };
    const escape=event=>{if(event.key==='Escape'){setOpen(false);anchor.current?.focus();}};
    reposition();
    window.addEventListener('resize',reposition);
    document.addEventListener('scroll',reposition,true);
    document.addEventListener('pointerdown',outside,true);
    document.addEventListener('keydown',escape);
    return ()=>{
      window.removeEventListener('resize',reposition);
      document.removeEventListener('scroll',reposition,true);
      document.removeEventListener('pointerdown',outside,true);
      document.removeEventListener('keydown',escape);
    };
  },[open,options.length]);
  return <><button ref={anchor} type="button" className="filter-control"
    data-filter-heading={heading} aria-label={`${heading}：${label}${toggle?'，点击切换':''}`}
    title={`${heading}：${label}`} aria-haspopup={toggle?undefined:'menu'} aria-expanded={toggle?undefined:open}
    onClick={()=>toggle?onChange(value==='asc'?'desc':'asc'):setOpen(wasOpen=>!wasOpen)}>
    <i aria-hidden="true">{toggle?(value==='asc'?'↑':'↓'):glyph}</i><span>{label}</span>
    <span className="filter-width-reserve" aria-hidden="true">{reserve}</span>
  </button>{open&&position?createPortal(<section className="swift-popover swift-menu library-filter-menu"
    data-react-filter-menu="" role="menu" aria-label={heading} style={{position:'fixed',...position}}>
    <div className="popover-content">{options.map(([id,text])=><button key={id} type="button"
      role="menuitemradio" aria-checked={id===value} onClick={()=>{onChange(id);setOpen(false);anchor.current?.focus();}}>
      {text}</button>)}</div>
  </section>,document.body):null}</>;
}

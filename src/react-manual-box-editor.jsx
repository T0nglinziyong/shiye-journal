import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {paperOverlayRect} from './import-coordinate.js';
import {transformSelectedFrame,isObjectDeleteKey} from './selection-transform.js';

const bounded=value=>Math.max(0,Math.min(1,value));
const candidateBoxes=candidates=>candidates.map((candidate,sourceIndex)=>{
  const rect=candidate.orientedBox;
  return rect?{...candidate,sourceIndex,x:rect.centerX-rect.width/2,
    y:rect.centerY-rect.height/2,w:rect.width,h:rect.height,rotation:rect.rotation}:
    {...candidate,sourceIndex,rotation:candidate.rotation||0};
});

export function ManualBoxEditor({state,previewRef,onCancel,onDone,onError}){
  const [boxes,setBoxes]=useState(()=>candidateBoxes(state.importCandidates||[]));
  const boxesRef=useRef(boxes);boxesRef.current=boxes;
  const [selected,setSelected]=useState(null),selectedRef=useRef(null);
  const [rect,setRect]=useState({left:0,top:0,width:1,height:1}),
    [busy,setBusy]=useState(false);
  const overlay=useRef(null),drag=useRef(null);
  const source=state.correctedBitmap||state.importBitmap;
  const paper=state.correctedBitmap?{x:0,y:0,w:1,h:1}:state.importBox;
  const select=index=>{selectedRef.current=index;setSelected(index);};
  const update=next=>{boxesRef.current=next;setBoxes(next);};
  const removeSelected=()=>{
    if(selectedRef.current==null)return;
    update(boxesRef.current.filter((_,index)=>index!==selectedRef.current));
    select(null);drag.current=null;
  };
  useLayoutEffect(()=>{
    const host=previewRef.current;
    if(!host||!source)return;
    const position=()=>setRect(paperOverlayRect(host.clientWidth,host.clientHeight,
      source.width,source.height,paper));
    const observer=new ResizeObserver(position);observer.observe(host);
    const image=host.querySelector(':scope > img');
    image?.addEventListener('load',position);
    position();return ()=>{observer.disconnect();image?.removeEventListener('load',position);};
  },[previewRef,source,paper.x,paper.y,paper.w,paper.h]);
  useEffect(()=>{
    const keydown=event=>{
      if(selectedRef.current==null||!isObjectDeleteKey(event))return;
      event.preventDefault();event.stopPropagation();removeSelected();
    };
    document.addEventListener('keydown',keydown);
    return ()=>document.removeEventListener('keydown',keydown);
  },[]);
  const point=event=>{
    const bounds=overlay.current.getBoundingClientRect();
    return {x:bounded((event.clientX-bounds.left)/bounds.width),
      y:bounded((event.clientY-bounds.top)/bounds.height)};
  };
  const pointerDown=event=>{
    if(event.button>0||event.target.closest('.box-delete'))return;
    event.preventDefault();event.stopPropagation();
    const target=event.target.closest('[data-box]'),start=point(event);
    if(target){
      const index=Number(target.dataset.box);select(index);
      drag.current={id:event.pointerId,start,
        mode:event.target.closest('[data-mode]')?.dataset.mode||'move',
        original:{...boxesRef.current[index]}};
    }else{
      const index=boxesRef.current.length;select(index);
      update([...boxesRef.current,{x:start.x,y:start.y,w:0,h:0,rotation:0,manualChanged:true}]);
      drag.current={id:event.pointerId,start,mode:'create'};
    }
    overlay.current.setPointerCapture(event.pointerId);
  };
  const pointerMove=event=>{
    const gesture=drag.current;if(!gesture||gesture.id!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();
    const end=point(event),index=selectedRef.current,
      current=boxesRef.current[index],original=gesture.original;
    if(!current)return;
    const box={...current};
    if(gesture.mode==='create')Object.assign(box,{
      x:Math.min(end.x,gesture.start.x),y:Math.min(end.y,gesture.start.y),
      w:Math.abs(end.x-gesture.start.x),h:Math.abs(end.y-gesture.start.y)
    });
    else if(gesture.mode==='move')Object.assign(box,{
      x:Math.max(0,Math.min(1-original.w,original.x+end.x-gesture.start.x)),
      y:Math.max(0,Math.min(1-original.h,original.y+end.y-gesture.start.y))
    });
    else{
      const width=overlay.current.clientWidth,height=overlay.current.clientHeight;
      const output=transformSelectedFrame({x:original.x*width,y:original.y*height,
        width:original.w*width,height:original.h*height,rotation:original.rotation||0},
      gesture.mode,{x:gesture.start.x*width,y:gesture.start.y*height},
        {x:end.x*width,y:end.y*height},{minWidth:width*.008,minHeight:height*.008,
          maxWidth:width,maxHeight:height});
      const w=Math.min(1,output.width/width),h=Math.min(1,output.height/height);
      Object.assign(box,{x:Math.max(0,Math.min(1-w,output.x/width)),
        y:Math.max(0,Math.min(1-h,output.y/height)),w,h,rotation:output.rotation});
    }
    if(original&&['x','y','w','h','rotation'].some(key=>
      Math.abs((box[key]||0)-(original[key]||0))>1e-6))box.manualChanged=true;
    box.orientedBox={centerX:box.x+box.w/2,centerY:box.y+box.h/2,
      width:box.w,height:box.h,rotation:box.rotation||0,autoDeskew:true,source:'manual'};
    const next=[...boxesRef.current];next[index]=box;update(next);
  };
  const pointerUp=event=>{
    const gesture=drag.current;if(!gesture||gesture.id!==event.pointerId)return;
    const index=selectedRef.current,box=boxesRef.current[index];
    if(box&&(box.w<.01||box.h<.01)){
      update(boxesRef.current.filter((_,at)=>at!==index));select(null);
    }
    drag.current=null;
  };
  const pointerCancel=()=>{
    const gesture=drag.current;if(!gesture)return;
    const index=selectedRef.current,next=[...boxesRef.current];
    if(gesture.original)next[index]=gesture.original;else next.splice(index,1);
    update(next);drag.current=null;
  };
  const finish=async()=>{
    if(busy)return;setBusy(true);
    try{if(await onDone(boxesRef.current)===false)setBusy(false);}
    catch(cause){onError?.(cause.message||'手动标记失败');setBusy(false);}
  };
  return <>{previewRef.current?createPortal(<div ref={overlay} className="manual-box-layer multi-box-editor" style={{
    left:rect.left,top:rect.top,width:rect.width,height:rect.height}}
    onPointerDown={pointerDown} onPointerMove={pointerMove}
    onPointerUp={pointerUp} onPointerCancel={pointerCancel}>
    {boxes.map((box,index)=><div key={box.sourceIndex??`new-${index}`}
      className={`import-region ${selected===index?'active':''}`} data-box={index}
      style={{left:`${box.x*100}%`,top:`${box.y*100}%`,width:`${box.w*100}%`,
        height:`${box.h*100}%`,transform:`rotate(${box.rotation||0}deg)`,
        zIndex:selected===index?2:1}}>
      <span className="box-number">{index+1}</span>
      {selected===index?<>
        <button type="button" className="box-grip top" data-mode="top" aria-label="拉伸高度"/>
        <button type="button" className="box-grip right" data-mode="right" aria-label="拉伸宽度"/>
        <button type="button" className="box-grip corner" data-mode="corner" aria-label="缩放并旋转"/>
        <button type="button" className="box-delete" aria-label="删除选中素材框"
          onPointerDown={event=>event.stopPropagation()} onClick={event=>{
            event.stopPropagation();removeSelected();}}>×</button>
      </>:null}
    </div>)}
  </div>,previewRef.current):null}<div className="import-photo-tools">
    <button type="button" className="btn" onClick={onCancel}>取消标记</button>
    <button type="button" className="btn" onClick={removeSelected}>移除选中</button>
    <button type="button" className="btn" onClick={()=>{update([]);select(null);drag.current=null;}}>清空框</button>
    <button type="button" className="btn" disabled={busy} onClick={()=>void finish()}>完成标记</button>
  </div></>;
}

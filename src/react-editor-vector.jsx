import React,{useRef,useState} from 'react';
import {vectorEditorState,vectorContours,moveVectorHandle,changeVectorPointCount,vectorGeometryPatch} from './editor-vector-geometry.js';
import {graphicPaintFrame,hasGraphicEffects} from './graphic-effects.js';
import {shapeSVG} from './editor-tools-model.js';
import './editor-vector.css';

export function EditorVectorPanel({node,onAction}){
 const [selection,setSelection]=useState([0,0]);
 let initial;try{initial=vectorEditorState(node);}catch(error){return <p role="status">{error.message}</p>;}
 const geometry=initial.value.map(p=>initial.key==='svgPaths'?p.d:initial.key==='vectorLayers'?{paths:p.paths,rects:p.rects}:p);
 return <details className="editor-vector-panel"><summary>编辑图形轮廓</summary>
  <VectorDraft key={node.id+JSON.stringify([initial.frame,geometry])} node={node} initial={initial} onAction={onAction} selection={selection} onSelect={setSelection}/>
 </details>;
}
function VectorDraft({node,initial,onAction,selection,onSelect}){
 const [draft,setDraft]=useState(initial),[error,setError]=useState('');
 const svg=useRef(null),drawing=useRef(null),drag=useRef(null),contours=vectorContours(draft),selected=Math.min(selection[0],contours.length-1),contour=contours[selected],point=Math.min(selection[1],(contour?.handles.length||1)-1),handle=contour?.handles[point];
 const setPoint=index=>onSelect([selected,index]);
 const [x,y,w,h]=draft.frame,pad=w*.06,r=w*.018,sy=node.height/node.width*w/h;
 const initialPoints=vectorContours(initial).flatMap(c=>c.handles.map(h=>h.point));
 const bounds=initialPoints.reduce((b,[px,py])=>[Math.min(b[0],px),Math.min(b[1],py),Math.max(b[2],px),Math.max(b[3],py)],[x,y,x+w,y+h]),[left,top,right,bottom]=bounds.map((v,i)=>v+(i<2?-pad:pad));
 const change=fn=>{try{setDraft(fn(draft));setError('');}catch(issue){setError(issue.message);}};
 const move=(index,p)=>change(state=>moveVectorHandle(state,selected,index,p));
 const nudge=(dx,dy)=>{if(handle)move(point,[handle.point[0]+dx*w*.01,handle.point[1]+dy*h*.01]);};
 const polygon=!!contour&&draft.key!=='svgPaths'&&contour.source.kind!=='rects';
 const staged={...node,...vectorGeometryPatch(node,draft)},preview=shapeSVG(staged),paint=hasGraphicEffects(staged)?graphicPaintFrame(staged):{left:0,top:0,width:node.width,height:node.height};
 return <div className="stack">
  <small>拖动圆点调整轮廓，方点调整曲线。预览保留原有色层；应用后可在画布查看，完成才保存。</small>
  <label>选择轮廓<select value={selected} onChange={e=>{onSelect([Number(e.target.value),0]);}}>{contours.map((c,i)=><option value={i} key={i}>{c.label}</option>)}</select></label>
  <svg ref={svg} role="img" aria-label="图形轮廓编辑预览" viewBox={`${left} ${top*sy} ${right-left} ${(bottom-top)*sy}`}
   onPointerMove={event=>{
    if(drag.current===null)return;const matrix=drawing.current.getScreenCTM();if(!matrix)return;
    const p=svg.current.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const local=p.matrixTransform(matrix.inverse());move(drag.current,[local.x,local.y]);
   }} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
   <g ref={drawing} transform={`scale(1 ${sy})`}>
   <rect x={x} y={y} width={w} height={h} fill="#fff" stroke="#ddd" strokeWidth={w*.002}/>
   <image x={x-paint.left/node.width*w} y={y-paint.top/node.height*h} width={paint.width/node.width*w} height={paint.height/node.height*h} preserveAspectRatio="none" href={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(preview)}/>
   {contour?<path d={contour.d} fill="none" stroke="#376d8a" strokeWidth={w*.003} strokeDasharray={`${w*.015} ${w*.012}`}/>:null}
   {contour?.handles.map((p,i)=><g key={i}>
    {p.from?<line x1={p.from[0]} y1={p.from[1]} x2={p.point[0]} y2={p.point[1]} stroke="#a17646" strokeWidth={w*.002}/>:null}
    <g role="button" tabIndex="0" aria-label={`${p.role==='control'?'曲线控制点':'轮廓节点'} ${i+1}`} aria-pressed={point===i}
     onFocus={()=>setPoint(i)} onKeyDown={event=>{const dir={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(dir){event.preventDefault();const step=event.shiftKey?.001:.01;move(i,[p.point[0]+dir[0]*w*step,p.point[1]+dir[1]*h*step]);}}}
     onPointerDown={event=>{event.preventDefault();event.stopPropagation();setPoint(i);drag.current=i;svg.current.setPointerCapture(event.pointerId);}}>
     <circle cx={p.point[0]} cy={p.point[1]} r={r*2} fill="transparent" stroke="transparent" strokeWidth="24" vectorEffect="non-scaling-stroke"/>
     {p.role==='control'?<rect x={p.point[0]-r*.65} y={p.point[1]-r*.65} width={r*1.3} height={r*1.3} fill={point===i?'#ae682e':'#fff'} stroke="#865c34" strokeWidth={r*.2}/>:
      <circle cx={p.point[0]} cy={p.point[1]} r={r*.65} fill={point===i?'#ae682e':'#fff'} stroke="#376d8a" strokeWidth={r*.2}/>}
    </g>
   </g>)}
   </g>
  </svg>
  <label>选择节点<select value={point} onChange={e=>setPoint(Number(e.target.value))}>{contour?.handles.map((p,i)=><option key={i} value={i}>{p.role==='control'?'曲线控制点':'轮廓节点'} {i+1}</option>)}</select></label>
  <div className="editor-vector-nudges" role="group" aria-label="微调图形节点">
   {[['左移',-1,0],['上移',0,-1],['下移',0,1],['右移',1,0]].map(([title,dx,dy])=><button className="btn mini" type="button" key={title} disabled={!handle} onClick={()=>nudge(dx,dy)}>{title}</button>)}
  </div>
  {polygon?<div className="form-grid"><button type="button" className="btn mini" disabled={contour.handles.length>=512} onClick={()=>{change(state=>changeVectorPointCount(state,selected,point));setPoint(point+1);}}>在此点后加点</button>
   <button type="button" className="btn mini" disabled={contour.handles.length<=3} onClick={()=>{change(state=>changeVectorPointCount(state,selected,point,true));setPoint(0);}}>删除当前点</button></div>:null}
  {draft.key==='svgPaths'?<details><summary>路径颜色</summary><div className="stack">
   {['fill','stroke'].map(field=>{
    const path=node.svgPaths[selected],own=Object.hasOwn(path,field),mode=!own?'inherit':path[field]===null?'none':'color',title=field==='fill'?'路径填充':'路径线条';
    return <div key={field}><label>{title}<select value={mode} onChange={e=>onAction('fabric-inspector-vector-style',{index:selected,field,value:e.target.value==='inherit'?'inherit':e.target.value==='none'?null:node[field]||'#547da4'})}>
     <option value="inherit">沿用整体</option><option value="color">独立颜色</option><option value="none">{field==='fill'?'无填充':'无线条'}</option>
    </select></label>{mode==='color'?<label>{title}颜色<input type="color" value={path[field]} onInput={e=>onAction('fabric-inspector-vector-style',{index:selected,field,value:e.target.value})}/></label>:null}</div>;
   })}
   <label>路径透明度<input type="range" min="0" max="1" step=".05" value={node.svgPaths[selected].opacity??1} onChange={e=>onAction('fabric-inspector-vector-style',{index:selected,field:'opacity',value:Number(e.target.value)})}/></label>
  </div></details>:null}
  {error?<p role="alert">{error}</p>:null}
  <button type="button" className="btn primary" onClick={()=>onAction('fabric-inspector-vector',draft)}>应用图形轮廓</button>
  <button type="button" className="btn" onClick={()=>{setDraft(initial);onSelect([0,0]);setError('');}}>重置本次轮廓调整</button>
 </div>;
}

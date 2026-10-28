import React,{useEffect,useId,useRef,useState} from 'react';
import {fullDisplayMask,maskRequest,maskRingPreset} from './scene-mask-edit.js';

const editableMask=value=>value?{outer:structuredClone(value.outer),holes:structuredClone(value.holes||[])}:fullDisplayMask();

export function EditorMaskPanel({node,page,onAction}){
 const signature=JSON.stringify(node.vectorMask||null),pattern=useId().replaceAll(':',''),svg=useRef(null),drag=useRef(null);
 const [mask,setMask]=useState(()=>editableMask(node.vectorMask));
 const [ringIndex,setRingIndex]=useState(0),[pointIndex,setPointIndex]=useState(0),[mode,setMode]=useState('replace'),[error,setError]=useState('');
 useEffect(()=>{setMask(editableMask(JSON.parse(signature)));setRingIndex(0);setPointIndex(0);setError('');},[node.id,signature]);
 const rings=[mask.outer,...(mask.holes||[])],ring=rings[ringIndex]||rings[0],point=ring[pointIndex]||ring[0];
 const frame=node.type==='group'?(node.localTransform?node.layoutBox:page.canvas):node;
 const height=100*(frame?.height||1)/(frame?.width||1);
 const path=rings.map(r=>'M'+r.map(([x,y])=>`${x*100},${y*height}`).join('L')+'Z').join('');
 const setRing=next=>{setMask(m=>ringIndex===0?{...m,outer:next}:{...m,holes:m.holes.map((r,i)=>i===ringIndex-1?next:r)});setError('');};
 const movePoint=(index,position)=>setRing(ring.map((p,i)=>i===index?position.map(n=>Math.max(0,Math.min(1,n))):p));
 const chooseRing=index=>{setRingIndex(index);setPointIndex(0);};
 const apply=()=>{try{const request=maskRequest(mask,mode);setError('');onAction('fabric-inspector-mask',request);}catch(e){setError(e.message);}};
 const pointerMove=event=>{
  if(drag.current===null)return;const matrix=svg.current.getScreenCTM();if(!matrix)return;
  const p=svg.current.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
  const local=p.matrixTransform(matrix.inverse());movePoint(drag.current,[local.x/100,local.y/height]);
 };
 return <details className="editor-mask-panel"><summary>显示遮罩{node.vectorMask?' · 已设置':''}</summary><div className="stack">
  <small>蓝色区域保留显示，孔洞透明。拖动轮廓点改变形状，点击应用查看画布。只改变显示，不裁掉实物。</small>
  <svg ref={svg} viewBox={`-6 -6 112 ${height+12}`} role="img" aria-label="遮罩轮廓预览" style={{width:'100%',maxHeight:250,touchAction:'none',background:'#f5f4ef',borderRadius:8}}
   onPointerMove={pointerMove} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
   <defs><pattern id={pattern} width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#fff"/><rect width="2.5" height="2.5" fill="#ddd"/><rect x="2.5" y="2.5" width="2.5" height="2.5" fill="#ddd"/></pattern></defs>
   <rect width="100" height={height} fill={`url(#${pattern})`} stroke="#bbb" strokeWidth=".3"/>
   <path d={path} fill="#719cba" fillOpacity=".75" fillRule="evenodd" stroke="#3b677c" strokeWidth=".4"/>
   {ring.map(([x,y],i)=><g key={i} onPointerDown={event=>{event.preventDefault();event.stopPropagation();setPointIndex(i);drag.current=i;svg.current.setPointerCapture(event.pointerId);}}>
    <circle cx={x*100} cy={y*height} r="4" fill="transparent"/>
    <circle cx={x*100} cy={y*height} r={i===pointIndex?1.8:1} fill={i===pointIndex?'#b96b35':'#fff'} stroke="#3b677c" strokeWidth=".4"/>
   </g>)}
  </svg>
  <label>编辑轮廓<select value={ringIndex} onChange={e=>chooseRing(Number(e.target.value))}><option value="0">外轮廓</option>{mask.holes.map((_,i)=><option key={i+1} value={i+1}>孔洞 {i+1}</option>)}</select></label>
  <div className="form-grid"><button type="button" className="btn mini" onClick={()=>{setRing(maskRingPreset('rect',ringIndex>0));setPointIndex(0);}}>矩形轮廓</button><button type="button" className="btn mini" onClick={()=>{setRing(maskRingPreset('ellipse',ringIndex>0));setPointIndex(0);}}>椭圆轮廓</button></div>
  <div className="form-grid"><button type="button" className="btn mini" disabled={ring.length>=256} onClick={()=>{const next=ring[(pointIndex+1)%ring.length],middle=point.map((n,i)=>(n+next[i])/2);setRing([...ring.slice(0,pointIndex+1),middle,...ring.slice(pointIndex+1)]);setPointIndex(pointIndex+1);}}>在此点后加点</button><button type="button" className="btn mini" disabled={ring.length<=3} onClick={()=>{setRing(ring.filter((_,i)=>i!==pointIndex));setPointIndex(0);}}>删除当前点</button></div>
  <div className="form-grid"><button type="button" className="btn mini" disabled={mask.holes.length>=16} onClick={()=>{setMask({...mask,holes:[...mask.holes,maskRingPreset('rect',true)]});chooseRing(mask.holes.length+1);setError('');}}>添加孔洞</button><button type="button" className="btn mini" disabled={!ringIndex} onClick={()=>{setMask({...mask,holes:mask.holes.filter((_,i)=>i!==ringIndex-1)});chooseRing(0);}}>删除此孔洞</button></div>
  <details><summary>精细调整</summary><div className="stack">
  <label>轮廓点<select value={pointIndex} onChange={e=>setPointIndex(Number(e.target.value))}>{ring.map((_,i)=><option key={i} value={i}>点 {i+1}</option>)}</select></label>
  <div className="form-grid">{['X','Y'].map((axis,i)=><label key={axis}>位置 {axis}（%）<input type="number" min="0" max="100" step="1" value={Number((point[i]*100).toFixed(2))} onChange={e=>{const next=[...point];next[i]=Number(e.target.value)/100;movePoint(pointIndex,next);}}/></label>)}</div>
  <label>应用方式<select value={mode} onChange={e=>setMode(e.target.value)}><option value="replace">替换显示区域</option><option value="intersect">与现有区域取交集</option><option value="subtract">从现有区域挖空</option></select></label>
  </div></details>
  {error?<p role="alert">{error}</p>:null}
  <button type="button" className="btn primary" onClick={apply}>应用显示遮罩</button>
  <button type="button" className="btn" disabled={!node.vectorMask} onClick={()=>onAction('fabric-inspector-mask',{mode:'clear'})}>清除显示遮罩</button>
 </div></details>;
}
